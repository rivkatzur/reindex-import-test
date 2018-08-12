var schedule = require('node-schedule');
var ctrl = require('./controller');

module.exports = function(cron, db) {
    var importRecordsCtrl = new ctrl(db);
    
    var job = schedule.scheduleJob(cron, function(){
        console.log('Start import records!');
          importRecordsCtrl.start(null, null, function(){
            importRecordsCtrl.upload(null, null, function(){
                importRecordsCtrl.arrange(null, null, function(){
                    importRecordsCtrl.saveRecords(null, null, function(){
                        importRecordsCtrl.end(null, null, function(){
                            console.log('end---------------------------------------------------------');
                        });
                    });
                });
            });
         });
    });

    // console.log(job.nextInvocation(), new Date());
     
}
