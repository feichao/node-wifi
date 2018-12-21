var fs = require('fs');
var exec = require('child_process').exec;
var env = require('./env');
var scan = require('./windows-scan');

function execCommand(cmd) {
    return new Promise(function(resolve, reject) {
        exec(cmd, env, function(err, stdout, stderr) {
            if (err) {
                // Add command output to error, so it's easier to handle
                err.stdout = stdout;
                err.stderr = stderr;

                reject(err);
            } else {
                resolve(stdout);
            }
        });
    });
}

function connectToWifi(config, ap, callback) {
    // 如果是中文, 则是被解码后的 ssid
    var ssidDecoded = ap.ssidDecoded || ap.ssid;
    var apFilePath = process.env.TEMP + "\\" + ssidDecoded + ".xml";
    scan(config)()
        .then(function(networks) {
            var selectedAp = networks.find(function(network) {
                return network.ssid === ap.ssid;
            });

            if (selectedAp === undefined) {
                throw "SSID not found";
            }

            selectedAp.ssid = ssidDecoded;

            fs.writeFileSync(apFilePath, win32WirelessProfileBuilder(selectedAp, ap.password));
        })
        .then(function() {
            return execCommand("netsh wlan add profile filename=\"" + apFilePath + "\"")
        })
        .then(function() {
            return execCommand("netsh wlan connect name=\"" + (ssidDecoded + '').trim() + "\"");
        })
        .then(function() {
            return execCommand("del \"" + apFilePath + "\"");
        })
        .then(function() {
            callback && callback();
        })
        .catch(function(err) {
            exec('netsh wlan delete profile "' + ap.ssid + '"', env, function() {
                callback && callback(err);
            });
        });
}

function getHexSsid(plainTextSsid) {
    var i, j, ref, hex;

    plainTextSsid = Buffer.from(plainTextSsid, 'utf8');

    hex = "";

    for (i = j = 0, ref = plainTextSsid.length - 1; 0 <= ref ? j <= ref : j >= ref; i = 0 <= ref ? ++j : --j) {
        hex += plainTextSsid[i].toString(16);
    }

    return hex;
}

function win32WirelessProfileBuilder(selectedAp, key) {
    var profile_content = "<?xml version=\"1.0\"?> <WLANProfile xmlns=\"http://www.microsoft.com/networking/WLAN/profile/v1\"> <name>" + selectedAp.ssid + "</name> <SSIDConfig> <SSID> <hex>" + getHexSsid(selectedAp.ssid) + "</hex> <name>" + selectedAp.ssid + "</name> </SSID> </SSIDConfig>";

    if (selectedAp.security.indexOf("WPA2") !== -1) {
        profile_content += "<connectionType>ESS</connectionType> <connectionMode>auto</connectionMode> <autoSwitch>true</autoSwitch> <MSM> <security> <authEncryption> <authentication>WPA2PSK</authentication> <encryption>AES</encryption> <useOneX>false</useOneX> </authEncryption> <sharedKey> <keyType>passPhrase</keyType> <protected>false</protected> <keyMaterial>" + key + "</keyMaterial> </sharedKey> </security> </MSM>";
    } else if (selectedAp.security.indexOf("WPA") !== -1) {
        profile_content += "<connectionType>ESS</connectionType> <connectionMode>auto</connectionMode> <autoSwitch>true</autoSwitch> <MSM> <security> <authEncryption> <authentication>WPAPSK</authentication> <encryption>TKIP</encryption> <useOneX>false</useOneX> </authEncryption> <sharedKey> <keyType>passPhrase</keyType> <protected>false</protected> <keyMaterial>" + key + "</keyMaterial> </sharedKey> </security> </MSM>";
    } else {
        if (selectedAp.security_flags.indexOf("WEP") !== -1) {
            profile_content += "<connectionType>ESS</connectionType> <connectionMode>auto</connectionMode> <autoSwitch>true</autoSwitch> <MSM> <security> <authEncryption> <authentication>open</authentication> <encryption>WEP</encryption> <useOneX>false</useOneX> </authEncryption> <sharedKey> <keyType>networkKey</keyType> <protected>false</protected> <keyMaterial>" + key + "</keyMaterial> </sharedKey> </security> </MSM>";
        } else {
            profile_content += "<connectionType>ESS</connectionType> <connectionMode>manual</connectionMode> <MSM> <security> <authEncryption> <authentication>open</authentication> <encryption>none</encryption> <useOneX>false</useOneX> </authEncryption> </security> </MSM>";
        }
    }

    profile_content += "</WLANProfile>";
    return profile_content;
}

module.exports = function (config) {
    return function(ap, callback) {
        if (callback) {
            connectToWifi(config, ap, callback);
        } else {
            return new Promise(function (resolve, reject) {
                connectToWifi(config, ap, function (err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                })
            });
        }
    }
}
