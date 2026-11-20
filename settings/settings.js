var mqtt = {};
var powerTopics = {};
var csvLogDates = [];

function onHomeyReady(Homey) {
    Homey.ready();

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
                document.getElementById('setting-csvretention').style.display = 'table';
            }
        }
    });

    Homey.get('csvLogRetentionDays', function (err, data) {
        if ( err ) {
            Homey.alert( err );
        } else {
            if (data != (null || undefined)) {
                document.getElementById('settings-csv-retention-days').value = data
            } else {
                document.getElementById('settings-csv-retention-days').value = 30
            }
        }
    });

    Homey.api('GET', '/logs', function (err, dates) {
        if ( err ) {
            Homey.alert( err );
        } else {
            csvLogDates = dates;
            var months = [];
            dates.forEach(function (date) {
                var month = date.slice(0, 7);
                if (months.indexOf(month) === -1) months.push(month);
            });
            populateCsvMonthOptions(months, Homey);
        }
    });

    document.getElementById('setting-enabledebug').style.display = 'block';

    document.getElementById('connect').addEventListener('click', function(elem) {
        saveSettings();
    });

    document.getElementById('settings-enable-debug').addEventListener('click', function(elem) {
        onSetDebug(Homey);
    });

    document.getElementById('settings-csv-retention-days').addEventListener('blur', function(elem) {
        onCsvRetentionDays(Homey);
    });

    document.getElementById('settings-csv-month').addEventListener('change', function(elem) {
        onCsvMonthChange(Homey);
    });

    document.getElementById('settings-csv-day').addEventListener('change', function(elem) {
        onCsvDayChange();
    });

    document.getElementById('settings-csv-download').addEventListener('click', function(elem) {
        onCsvDownload(Homey);
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
        document.getElementById('setting-csvretention').style.display = 'table';
    } else {
        document.getElementById('setting-csvretention').style.display = 'none';
    }
}

function onCsvRetentionDays(Homey) {
    const csvLogRetentionDays = document.getElementById('settings-csv-retention-days').value
    Homey.set('csvLogRetentionDays', csvLogRetentionDays);
}

function populateCsvMonthOptions(months, Homey) {
    var select = document.getElementById('settings-csv-month');
    select.innerHTML = '';
    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.text = Homey.__('settings.csvdownload.selectmonth');
    select.appendChild(placeholder);
    months.forEach(function (month) {
        var option = document.createElement('option');
        option.value = month;
        option.text = month;
        select.appendChild(option);
    });
}

function populateCsvDayOptions(month) {
    var select = document.getElementById('settings-csv-day');
    select.innerHTML = '';
    var days = csvLogDates.filter(function (date) {
        return date.slice(0, 7) === month;
    });
    days.forEach(function (date) {
        var option = document.createElement('option');
        option.value = date;
        option.text = date;
        select.appendChild(option);
    });
    select.disabled = days.length === 0;
    document.getElementById('settings-csv-download').disabled = days.length === 0;
}

function onCsvMonthChange(Homey) {
    var month = document.getElementById('settings-csv-month').value;
    populateCsvDayOptions(month);
}

function onCsvDayChange() {
    var day = document.getElementById('settings-csv-day').value;
    document.getElementById('settings-csv-download').disabled = !day;
}

function onCsvDownload(Homey) {
    var date = document.getElementById('settings-csv-day').value;
    if (!date) return;

    Homey.api('GET', '/logs/' + date + '/url', function (err, url) {
        if ( err ) {
            Homey.alert( err );
        } else {
            Homey.openURL(url);
        }
    });
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
