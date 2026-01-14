# Daikin Altherma

Get all information from your Daikin Altherma.

The information is obtained over MQTT from an ESPAltherma device 
(see: https://github.com/daneedk/ESPAltherma which is a fork of: https://github.com/raomin/ESPAltherma)

```Important, everything is read only, it is and will not be possible to control your heat pump with this app!```

This app will expose 2 devices, a Heat Pump and a Water Heater (DHW) device.

### Heat Pump capabiltities
* Operation Mode Heating/Fan Only
* Thermostat On/Off
* Space Heating On/Off
* Outdoor temperature
* Leaving Water temperature
* Returning Water temperature
* ΔT (flow–return)
* Target temperature
* Water flow
* Power
* Energy Today
* Energy this Month
* Energy this Year
* COP

### Water Heater capabiltities
* DHW tank temperature
* DHW tank target temperature
* Powerful mode On/Off
* Power
* Energy Today
* Energy this Month
* Energy this Year

The folowing information is needed from ESPAltherma, make sure to uncomment the corresponding lines in the definition file for you particular device model

````
{0x10,0,217,1,-1,"Operation Mode"},
{0x10,1,307,1,-1,"Thermostat ON/OFF"},
{0x10,1,304,1,-1,"Defrost Operation"},
{0x10,4,203,1,-1,"Error type"},
{0x10,5,204,1,-1,"Error Code"},
{0x20,0,105,2,1,"R1T-Outdoor air temp."},
{0x21,0,105,2,-1,"INV primary current (A)"},    
{0x21,2,105,2,-1,"INV secondary current (A)"},
{0x60,2,315,1,-1,"I/U operation mode"},
{0x60,7,105,2,1,"DHW setpoint"},
{0x60,9,105,2,1,"LW setpoint (main)"},
{0x60,12,306,1,-1,"3way valve(On:DHW_Off:Space)"},
{0x60,12,304,1,-1,"BUH Step1"},
{0x60,12,303,1,-1,"BUH Step2"},
{0x61,2,105,2,1,"Leaving water temp. before BUH (R1T)"},
{0x61,4,105,2,1,"Leaving water temp. after BUH (R2T)"},
{0x61,8,105,2,1,"Inlet water temp.(R4T)"},
{0x61,10,105,2,1,"DHW tank temp. (R5T)"},
{0x62,2,304,1,-1,"Powerful DHW Operation. ON/OFF"},
{0x62,2,303,1,-1,"Space heating Operation ON/OFF"},
{0x62,5,105,2,1,"RT setpoint"},
{0x62,7,304,1,-1,"Main RT Heating"},
{0x62,9,105,2,-1,"Flow sensor (l/min)"},
{0x63,14,161,1,-1,"Current measured by CT sensor of L1"},
{0x63,15,161,1,-1,"Current measured by CT sensor of L2"},
{0x63,16,161,1,-1,"Current measured by CT sensor of L3"},
{0x64,3,105,2,-1,"BE_COP"},
````

(Not all values are made visible in the UI, some are used for calculations, some may be for troubleshooting.)

As the Daikin Althermas returns no good measurement for power consumption other then the used current at the DC part of the device the power and energy comsumption are calculated values based on assumptions, so keep that in mind. (The grid voltage is assumed to be 230v and the efficiency in converting AC to DC is assumed to be 90%)

In a future version, these readings will be made more accurate, but that will require making the actual grid voltage available over MQTT or additional hardware in the form of a smart meter that measures the actual usage of your heat pump.



