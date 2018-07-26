
module.exports = function() {
    this.controller = require('./controller');
    this.scheduler = require('./scheduler');
    this.consumer = require('./consumer');    
    this.routes = require('./routes');    
}
