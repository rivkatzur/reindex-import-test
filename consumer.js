
'use strict';

var ImportRecordsCtrl = require('./controller');
var importRecordsCtrl = new ImportRecordsCtrl();
var fs = require('fs');
var path = require("path");
var inputPath = path.resolve(config.root, 'files');

module.exports = function(rabbit, qData) {
    rabbit.consume(qData.name, qData.maxUnackMessages, handleMessage);
};

function handleMessage(message, error, done) {
    importRecords(message, error, done);
}

function importRecords(message, error, done) {
    importRecordsCtrl.getResults(message.i).then(trials => {
        let sourceFile = `${inputPath}/records${message.i}.csv`;

        fs.writeFile(sourceFile, trials, function(err) {
            if(err) {
                return console.log(err);
            }

            console.log("The file was saved!");
            done();
            if (message.i >= parseInt(message.count)/100)
                importRecordsCtrl.emitter.emit('finish-reindex-import-from-api');
        }); 
    }).catch(err => {
        console.log('------------------', err, message);
        done();
    });
}
