const { createLogger, transports, format } = require('winston');

const customLogger = createLogger({
  transports: [
    new transports.File({
        filename: 'logErrors.log', level: 'error'
    }),
    new transports.File({ 
        filename: 'debug_logs.log', level: 'debug'  
    })
  ],
  format: format.combine(
    format.json(),
    format.metadata(),
    format.timestamp({ format: 'YYYY-MM-DD hh:mm:ss.SSS A' }),
    format.prettyPrint(),
    format.errors({ stack: true })
  )
});

module.exports = customLogger; 
