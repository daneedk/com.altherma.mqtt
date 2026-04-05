var mqtt = {};
var powerTopics = {};

function onHomeyReady(Homey) {
    Homey.ready();

    this.doubleClicked = false;
    this.keysEntered = "";
    this.isDebugEnabled = false

    writeAuthenticationState();

    Homey.on('com.altherma.status', function (data) { //find what to listen to.
        writeAuthenticationState();
    });

    Homey.get('isDebugEnabled', function (err, data) {
        if ( err ) {
            Homey.alert( err );
        } else {
            this.isDebugEnabled = data
            document.getElementById('settings-enable-debug').checked = data;

            if (data) {
                document.getElementById('setting-debuginfo').style.display = 'block';
            }
        }
    });

    document.getElementById('setting-enabledebug').style.display = 'block';

    document.getElementById('connect').addEventListener('click', function(elem) {
        saveSettings();
    });

    document.getElementById('settings-enable-debug').addEventListener('click', function(elem) {
        onSetDebug(Homey);
    });

    document.getElementById('use-3phase').addEventListener('click', function(elem) {
        on3phase(Homey);
    });

    document.getElementById('power-buh1').addEventListener('blur', function(elem) {
        onBuh1(Homey);
    });

    document.getElementById('power-buh2').addEventListener('blur', function(elem) {
        onBuh2(Homey);
    });

    document.getElementById('power-continuous').addEventListener('blur', function(elem) {
        onPC(Homey);
    });

    document.getElementById('topic-voltage1').addEventListener('blur', function(elem) {
        onVoltage1(Homey);
    });

    document.getElementById('topic-voltage2').addEventListener('blur', function(elem) {
        onVoltage2(Homey);
    });

    document.getElementById('topic-voltage3').addEventListener('blur', function(elem) {
        onVoltage3(Homey);
    });

    document.getElementById('use-external-voltage').addEventListener('click', function(elem) {
        onExternalVoltage(Homey);
    });

    //document.getElementById('save').addEventListener('click', function(elem) {
    //    savePowerTopics();
    //});

    Homey.get('mqtt', function(err, mqtt) {
        if ( err ) {
            Homey.alert( err );
        } else {
            if (mqtt != (null || undefined)) {
                console.log('savedSettings:')
                document.getElementById('host').value = mqtt.host
                document.getElementById('port').value = mqtt.port
                document.getElementById('usetls').checked = mqtt.tls
                document.getElementById('username').value = mqtt.user
                document.getElementById('password').value = mqtt.pass
            }
        }

    });

    Homey.get('powerTopics', function(err, powerTopics) {
        if ( err ) {
            Homey.alert( err );
        } else {
            if (powerTopics != (null || undefined)) {
                document.getElementById('topic-voltage1').value = powerTopics.voltage1
                document.getElementById('topic-voltage2').value = powerTopics.voltage2
                document.getElementById('topic-voltage3').value = powerTopics.voltage3
            }
        }
    });

    Homey.get('is3phaseEnabled', function(err, is3phaseEnabled) {
        if ( err ) {
            Homey.alert( err );
        } else {
            if (is3phaseEnabled != (null || undefined)) {
                document.getElementById('use-3phase').checked = is3phaseEnabled
                on3phase(Homey);
            }
        }
    });

    Homey.get('buhStep1W', function(err, buhStep1W) {
        if ( err ) {
            Homey.alert( err );
        } else {
            if (buhStep1W != (null || undefined)) {
                document.getElementById('power-buh1').value = buhStep1W
            } else {
                document.getElementById('power-buh1').value = 3000
            }
        }
    });

    Homey.get('buhStep2W', function(err, buhStep2W) {
        if ( err ) {
            Homey.alert( err );
        } else {
            if (buhStep2W != (null || undefined)) {
                document.getElementById('power-buh2').value = buhStep2W
            } else {
                document.getElementById('power-buh2').value = 6000
            }
        }
    });

    Homey.get('continuousPowerW', function(err, continuousPowerW) {
        if ( err ) {
            Homey.alert( err );
        } else {
            if (continuousPowerW != (null || undefined)) {
                document.getElementById('power-continuous').value = continuousPowerW
            } else {
                document.getElementById('power-continuous').value = 40
            }
        }
    });

    Homey.get('isExternalVoltageEnabled', function(err, isExternalVoltageEnabled) {
        if ( err ) {
            Homey.alert( err );
        } else {
            if (isExternalVoltageEnabled != (null || undefined)) {
                document.getElementById('use-external-voltage').checked = isExternalVoltageEnabled
                onExternalVoltage(Homey);
            }
        }
    });

}

function configureDebug() {
    // The stuff below is just for troubleshooting in the Developer Tools and will only work in a browser on a computer
    // Will not work on:
    let regexp = /android|iphone|ipad/i;
    let isMobileDevice = regexp.test(navigator.userAgent);
    let _this = this;
    if (!isMobileDevice) {
        document.getElementById('setting-debuginfo').style.display = 'block';
        console.clear();
        console.log('Single Click the app logo to see the log');
        console.log('Type "Clearlog" to clear the log');
        console.log('Press the Enter key to clear the type buffer');
        // single Click show the log
        document.getElementById('login-credentials-logo').addEventListener('click', function(elem) {
            Homey.get('mqttLog', function(err, logging){
                if( err ) {
                    console.error('showHistory: Could not get history', err);
                    return
                }
                console.clear();
                console.log(logging);
            });
        });
        // Check type text, if its Clearlog, clear it.
        document.addEventListener('keypress', function(event) {
            _this.keysEntered += event.key;
            if (_this.keysEntered == "Clearlog" ) {
                Homey.set('mqttLog','');
                console.clear();
                console.log("log was cleared");
                _this.keysEntered = "";
            }
            if (event.key == "Enter") {
                console.log("Try again...");
                _this.keysEntered = "";
            }
        });
    }
}

async function writeAuthenticationState() {
    console.log('Settingspage loaded');
    await Homey.get('mqttStatus')
        .then(async (result) => {
            console.log('mqttStatus',result);
            if (result == 'authenticated') {
                this.htmlString = Homey.__("settings.auth.authenticated")
                document.getElementById('status').innerHTML = this.htmlString;
            } else if (result == 'disconnected') {
                this.htmlString = Homey.__("settings.auth.disconnected")
                document.getElementById('status').innerHTML = this.htmlString;
            } else if (result == 'reconnecting') {
                this.htmlString = Homey.__("settings.auth.reconnecting")
                document.getElementById('status').innerHTML = this.htmlString;
            } else {
                this.htmlString = Homey.__("settings.auth.notauthenticated")
                document.getElementById('status').innerHTML = this.htmlString;
            }
        })
}

function onSetDebug(Homey) {    
    const isDebugEnabled = document.getElementById('settings-enable-debug').checked
    Homey.set('isDebugEnabled', isDebugEnabled);
    if (isDebugEnabled) {
        //configureDebug()
        document.getElementById('setting-debuginfo').style.display = 'block';        
    } else {
        document.getElementById('setting-debuginfo').style.display = 'none';
    }
}

function on3phase(Homey) {
    const is3phaseEnabled = document.getElementById('use-3phase').checked
    Homey.set('is3phaseEnabled', is3phaseEnabled);
    if (is3phaseEnabled) {
        document.getElementById('settings-external-voltage-phase2').style.display = '';
        document.getElementById('settings-external-voltage-phase3').style.display = '';
    } else {
        document.getElementById('settings-external-voltage-phase2').style.display = 'none';
        document.getElementById('settings-external-voltage-phase3').style.display = 'none';
    }
}

function onBuh1(Homey) {
    const buh1 = document.getElementById('power-buh1').value
    Homey.set('buhStep1W',buh1);
}

function onBuh2(Homey) {
    const buh2 = document.getElementById('power-buh2').value
    Homey.set('buhStep2W',buh2);
}

function onPC(Homey) {
    const pc = document.getElementById('power-continuous').value
    Homey.set('continuousPowerW',pc);
}

function onVoltage1(Homey) {
    powerTopics.voltage1 = document.getElementById('topic-voltage1')?.value || '';
    powerTopics.voltage2 = document.getElementById('topic-voltage2')?.value || '';
    powerTopics.voltage3 = document.getElementById('topic-voltage3')?.value || '';
    Homey.set('powerTopics', powerTopics);
}

function onVoltage2(Homey) {
    powerTopics.voltage1 = document.getElementById('topic-voltage1')?.value || '';
    powerTopics.voltage2 = document.getElementById('topic-voltage2')?.value || '';
    powerTopics.voltage3 = document.getElementById('topic-voltage3')?.value || '';
    Homey.set('powerTopics', powerTopics);
}

function onVoltage3(Homey) {
    powerTopics.voltage1 = document.getElementById('topic-voltage1')?.value || '';
    powerTopics.voltage2 = document.getElementById('topic-voltage2')?.value || '';
    powerTopics.voltage3 = document.getElementById('topic-voltage3')?.value || '';
    Homey.set('powerTopics', powerTopics);
}

function onExternalVoltage(Homey) {
    const isExternalVoltageEnabled = document.getElementById('use-external-voltage').checked
    Homey.set('isExternalVoltageEnabled', isExternalVoltageEnabled);
    if (isExternalVoltageEnabled) {
        document.getElementById('setting-external-voltage').style.display = 'block';
    } else {
        document.getElementById('setting-external-voltage').style.display = 'none';
    }
}

function saveSettings() {
    console.log('SaveSettings() called')
    mqtt.host = document.getElementById('host')?.value || '';
    mqtt.port = document.getElementById('port')?.value || '';
    mqtt.tls  = document.getElementById('usetls').checked;
    mqtt.user = document.getElementById('username')?.value || '';
    mqtt.pass = document.getElementById('password')?.value || '';
    Homey.set('mqtt', mqtt);
}

function savePowerTopics() {
    powerTopics.voltage1 = document.getElementById('topic-voltage1')?.value || '';
    powerTopics.voltage2 = document.getElementById('topic-voltage2')?.value || '';
    powerTopics.voltage3 = document.getElementById('topic-voltage3')?.value || '';
    Homey.set('powerTopics', powerTopics);
}
