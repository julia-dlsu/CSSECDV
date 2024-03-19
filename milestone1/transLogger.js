//const winston = require('winston');
const winston = require('express-winston');
require('winston-daily-rotate-file');
const {transports, createLogger, format} = require('winston');

//logging feature
const logger = createLogger({
    format: format.combine(
        format.timestamp({
            format: 'YYYY-MM-DD hh:mm:ss.SSS A',
        }),
        format.json(), //not sure to use simple or json
        format.prettyPrint()
    ),
    transports: [
        new transports.File({
            filename: 'trans_logs.log',
            level: 'debug'
        })
    ],
    statusLevels: true
});

module.exports = logger;