//const winston = require('winston');
const winston = require('express-winston');
require('winston-daily-rotate-file');
const {transports, createLogger, format} = require('winston');

//logging feature
const infoLogger = createLogger({
    transports: [
        new transports.File({
            filename: 'info_logs.log',
            level: 'info'
        }),

    ],
    format: format.combine(
        format.timestamp(),
        format.json(), //not sure to use simple or json
        format.prettyPrint(),
        format.errors({stack: true})
    ),
    statusLevels: true
});

module.exports = infoLogger;