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
                configureDebug()
            }
        }
    });

    // make the slider to enable debug logging only available in a computer browser
    let regexp = /android|iphone|ipad/i;
    let isMobileDevice = regexp.test(navigator.userAgent);
    if (!isMobileDevice) {
        document.getElementById('setting-enabledebug').style.display = 'block';
    }

    document.getElementById('connect').addEventListener('click', function(elem) {
        saveSettings();
    });

    document.getElementById('settings-enable-debug').addEventListener('click', function(elem) {
        onSetDebug(Homey);
    });

    document.getElementById('use-external-voltage').addEventListener('click', function(elem) {
        onExternalVoltage(Homey);
    });

    document.getElementById('save').addEventListener('click', function(elem) {
        savePowerTopics();
    });

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
        configureDebug()
        document.getElementById('setting-debuginfo').style.display = 'block';        
    } else {
        console.clear();
        document.getElementById('setting-debuginfo').style.display = 'none';
    }
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
