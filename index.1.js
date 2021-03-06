'use strict';

// =================================================================================
// App Configuration
// =================================================================================

const DEVICE_NAME_MAP = 'DEVICE_NAME_MAP';
const SOCKET_STATES = 'SOCKET_STATES';
const app = require('jovo-framework').Jovo;
const webhook = require('jovo-framework').Webhook;
var redis = require('redis');
var mqtt = require('mqtt');
var Map = require("collections/map");
var List = require("collections/list");
var subClient = mqtt.connect('mqtt://test.mosquitto.org');
var redisClient;

// Listen for post requests
webhook.listen(3000, function() {
    console.log('Local development server listening on port 3000.');

    redisClient = redis.createClient(6379, '127.0.0.1');
    redisClient.set("key", "value");
    console.log(redisClient.get("key"));

    subClient.on('connect', function () {
        subClient.subscribe('smartsocket/state/shadow');
        subClient.publish('smartsocket/state/shadow', 'Hello mqtt');
    });

    subClient.on('message', function (topic, message) {
        console.log(message.toString());
        if(topic === 'smartsocket/state/shadow'){
            saveSocketStates(message.toString());
        }
    });
});

webhook.post('/webhook', function(req, res) {
    app.handleRequest(req, res, handlers);
    console.log(req);
    app.execute();
});


// =================================================================================
// App Logic
// =================================================================================

const handlers = {

    'LAUNCH': function() {
        app.toIntent('HelloWorldIntent');
    },

    'HelloWorldIntent': function() {
        app.ask('Ok');
    },

    'ChangeSocketNameIntent': function(number, device) {
        console.log(device + ' ' + number);
        app.db().load(DEVICE_NAME_MAP, function(err, data) {
            console.log(data);
            if(data !== null){
                var map = new Map(data);
                unAssignDevice(map, device);
                assignDevice(map, number, device);
            }else{
                var map = new Map();
                unAssignDevice(map, device);
                assignDevice(map, number, device);
            }
        });
    },

    'SwitchNamedSocketOnIntent': function(device){
        console.log(device);
        app.db().load(DEVICE_NAME_MAP, function(err, data) {
            console.log(data);
            if(data !== null){
                var map = new Map(data);
                switchMapDevice(map, device, 1);
            }else{
                app.tell('Sorry there seems to be no socket mapped to that name');  //todo: make it an ask and use alexa state to know what to say yes or no to
            }                                                                       // example: would you like to assign it to a socket number?
        });
    },

    'SwitchNamedSocketOffIntent': function(device){
        console.log(device);
        app.db().load(DEVICE_NAME_MAP, function(err, data) {
            console.log(data);
            if(data !== null){
                var map = new Map(data);
                switchMapDevice(map, device, 0);
            }else{
                app.tell('Sorry there seems to be no socket mapped to that name');  //todo: make it an ask and use alexa state to know what to say yes or no to
            }                                                                       // example: would you like to assign it to a socket number?
        });
    },

    'SwitchSocketIntent': function(status, number) {
        var num = parseInt(number);
        if(isNaN(num)){
            app.ask('Sorry i did not fully understand that!, you can please ask me again or say "help" for other things you can try');
        }else{
            var state = (status === 'on')? 1 : 0;
            publishTopic('smartsocket/state/control', JSON.stringify({value: state, socket: num}));
            app.db().save('Socket' + num, status, function(err) {
                console.log(err);
                app.tell('socket ' + number + ' ' + status);
            });
        } 
    },

    'DimLampIntent': function(percent) {
        var num = parseInt(percent);
        if(isNaN(num)){
            app.ask('Sorry i did not fully understand that!, you can please ask me again or say "help" for other things you can try');
        }else if (num > 100){
            app.ask('Sorry ' + percent + 'is not a valid level, you can try levels in the range of 1 to 100 percent');
        }
        else{
            publishTopic('smartsocket/state/control', JSON.stringify({value: percent, socket: 20}));
            app.db().save('Dimmer', percent, function(err) {
                console.log(err);
                app.tell('Ok, level set to ' + percent + 'percent');
            });
        } 
    },

    'DimmerLevelIntent': function() {
        redisClient.get(SOCKET_STATES, function(err, reply){
            if(!err){
                try{
                    var states = JSON.parse(reply);
                    if(states !== null){
                        var percent = states.dim;
                        app.tell('Dimmer level is ' + percent + ' percent');
                    }else{
                        app.tell('Sorry, somthing went wrong. please you can try again');
                    }
                }catch(err){
                        app.tell('Sorry, somthing went wrong. please you can try again');
                }
            }else{
                app.tell('Sorry, somthing went wrong. please you can try again');
                console.log(reply.toString());
            }
        });
    }
};




/**
 *unassigns a device's name from a map socket number
 * @param {*} map the map object that maintains the map between socket number and device name
 * @param {*} device the device's valid name
 */
function unAssignDevice(map, device){
    var numbers = new List();
    console.log('listing device name ====')
    for(var i = 1; i <= 4; i++){
        var key = i;
        var deviceName = map.get(key.toString());
        console.log(deviceName);
        if(deviceName === device){
            numbers.add(i);
        }
    }
    console.log('length of list ====');
    console.log(numbers.length);
    for(var m = 0; m < numbers.length; m++){
        var key = numbers.pop();
        console.log(key);
        map.delete(key.toString());
        console.log(m);
    }
}



/**
 * assigns a device's name to a socket number
 * @param {*} map 
 * @param {*} number 
 * @param {*} device 
 */
function assignDevice(map, number, device){
    console.log(map);
    map.set(number, device);
    console.log('After setting');
    console.log(map);
    app.db().save(DEVICE_NAME_MAP, map, function(err) {
        app.tell('Ok, socket ' + number + ' has been named as ' + device);
    });
}


/**
 * searches for socket number mapped to the device mentioned
 * @param {*} map 
 * @param {*} device 
 * @param {*} state 
 */
function switchMapDevice(map, device, state){
    for(var i = 1; i <= 4; i++){
        var key = i;
        console.log(map);
        console.log(state);
        var deviceName = map.get(key.toString());
        console.log(deviceName);
        if(deviceName === device){
            console.log('socket: ' + i);
            publishTopic('smartsocket/state/control', JSON.stringify({value: state, socket: i}));
            var status = (state === 1)? ' on': ' off';
            app.tell('Ok, ' + device + ' ' + status);
            return;
        }
    }
    app.tell('Sorry, device ' + device + ', was not found');
}



function publishTopic(topic, message){
    var client  = mqtt.connect('mqtt://test.mosquitto.org');
    client.publish(topic, message);
    client.end();
}

function alarmTask(){
    console.log("im here tick tock!");
    if(subClient === null){
        subClient = mqtt.connect('mqtt://test.mosquitto.org');
    }
    if(subClient.disconnected){}
        subClient = mqtt.connect('mqtt://test.mosquitto.org');
        subClient.subscribe('smartsocket/state/shadow')
        subClient.on('message', function (topic, message) {
        console.log(message);
        console.log(topic);
    });
}

function saveSocketStates(states){
    try{
        var socketStates = JSON.parse(states);
        if(socketStates !== null){
            redisClient.set(SOCKET_STATES, JSON.stringify(socketStates));
        }
    }catch(err){
        console.log(err);
    }
}

// https://stackoverflow.com/questions/19349162/run-continuous-background-job-with-node-js
// https://stackoverflow.com/questions/17861362/node-js-child-process-difference-between-spawn-fork