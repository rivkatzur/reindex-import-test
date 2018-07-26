var ImportRecords = require("./../../controllers/importRecords");
const https = require('https');
const parseString = require('xml2js').parseString;
var util = require('util');
var shell = require('shelljs');
const csv=require('csvtojson')
var path = require("path");
var inputPath = path.resolve(config.root, 'files');

const limit = 100; //10,100,1000,10000

function ImportFromApi(mongoose) {
    if (mongoose) {
        this.Records = mongoose.model('Record');
    }

    ImportRecords.apply(this, arguments);
}

util.inherits(ImportFromApi, ImportRecords);

const parseXML = (xml) => {
    let response;
    parseString(xml, {
        explicitArray: false,
        mergeAttrs: true,
        normalize: true,
    }, (err, result) => {
        if (!err) { 
            response = result;
        } else {console.log(xml);
             throw err };
    });
    return response;
}

ImportFromApi.prototype.parseCSV = (csvString) => {
    return new Promise((resolve, reject) => {
        csv({
            output: "json"
        })
        .fromString(csvString)
        .then((csvRow)=>{ 
            return resolve(csvRow);
        })
    });
}

/*
* Make an async request using https
*/
ImportFromApi.prototype.httpGetAsync = (query, parse_xml = true) => {
    return new Promise((resolve, reject) => {
        const request = https.get(query, response => {
            if (response.statusCode < 200 || response.statusCode > 299) {
                reject(new Error('Failed to load page, status code: ' + response.statusCode));
            };
            let data = '';
            response.on('data', chunk => {data += chunk});
            response.on('end', () => {
                resolve(parse_xml ? parseXML(data) : data);
            });
        });
        request.on('error', (error) => reject(error));
    });
}

ImportFromApi.prototype.getResults = function(i) {
    return this.httpGetAsync("https://clinicaltrials.gov/ct2/results/download_fields?cond=Stroke&Search=Apply&recrs=a&recrs=f&cntry1=NA:US&down_count="+limit+"&down_fmt=csv&down_chunk="+i+"&down_flds=all", false).then(result => result);
    //.catch(err => {err: err; index: i});    
}

ImportFromApi.prototype.count = function() {
    return this.httpGetAsync("https://clinicaltrials.gov/ct2/results/download_fields?cond=Stroke&Search=Apply&recrs=a&recrs=f&cntry1=NA:US&down_count=1&down_fmt=xml&down_chunk=1").then(result => result.search_results.count);
}

ImportFromApi.prototype.start = function(req,res,next) {
    let self = this;
    console.log('curl -XDELETE ' + this.config.elastic.host + ':' + this.config.elastic.port + '/reindex-records')
    shell.exec('curl -XDELETE ' + this.config.elastic.host + ':' + this.config.elastic.port + '/reindex-records', function(err, result){
        self.Records.deleteMany({}, function (err, results) {
            next(); 
        });
    });
}

ImportFromApi.prototype.upload = function(req,res,next) {
    let self = this;
    this.count().then(count => {
        // console.log(count)
        // count = 3000; //for tests - delete it!!!!!
        console.log('Number of records to import:', count)
        var self = this;
        for (var i = 1; i < ((count / limit) + 1); i += 1) {
            this.producer.createJob('reindex-import-from-api', {i: i, count: count, index: this.config.records.index, type: this.config.records.type, config: this.config});
        };
        this.emitter.once('finish-reindex-import-from-api', function () {
            console.log('continue')
            for (var i = 1; i < ((count / limit) + 1); i += 1) {
                let sourceFile = `${inputPath}/records${i}.csv`;
                self.mongoImport(sourceFile, {'locationString': 'Locations'}).then(err => {
                    if (err) return res.status(400).send(err.message);
                    next();
                });
            }
        });
    });
} 

ImportFromApi.prototype.status = function(req, res, next) {
    res.send({now: new Date()})
}
  
module.exports = ImportFromApi;
