var ImportRecords = require("./../../controllers/importRecords");
const https = require('https');
const parseString = require('xml2js').parseString;
var util = require('util');
var shell = require('shelljs');
const csv=require('csvtojson')
var path = require("path");
var inputPath = path.resolve(config.root, 'files');
var fs = require('fs');
var extract = require('extract-zip')
var request = require('request');
var toolsPath = path.resolve(config.root, 'tools');
const limit = 10000; //10,100,1000,10000
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
ImportFromApi.prototype.httpGetAsync = (query, parse_xml = true, zip) => {
    return new Promise((resolve, reject) => {
        const requestGet = https.get(query, response => {
            if (response.statusCode < 200 || response.statusCode > 299) {
                reject(new Error('Failed to load page, status code: ' + response.statusCode));
            };
            let data = '';
            response.on('data', chunk => {data += chunk});
            response.on('end', () => {
                resolve(parse_xml ? parseXML(data) : data);
            });
        });
        requestGet.on('error', (error) => reject(error));
    });
}

const getLocation = (locations) => {
    if (locations.constructor === Array) {
        return locations.map((location) => {
            return [location.facility.address.city, location.facility.address.state, location.facility.address.zip, location.facility.address.country].join(',')
        }).join('|');
    }
    const location = locations;
    return [location.facility.address.city, location.facility.address.state, location.facility.address.zip, location.facility.address.country].join(',');
}

ImportFromApi.prototype.httpGetAsync1 = (query, parse_xml = true, zip) => {
    return new Promise((resolve, reject) => {
        const r = request(query)
        .on('error', function(err) {
            console.log(err)
            reject(err)
          })
        .pipe(fs.createWriteStream(`${inputPath}/search.zip`))
        .on('close', function () {
            // fs.createReadStream(`${inputPath}/search.zip`).pipe(unzip.Extract({ path: `${inputPath}/search`}));
            const titles = ['Rank','NCT Number','Title','Summary','Acronym','Status','Conditions','Interventions','Sponsor/Collaborators','Gender','minimum_age','maximum_age','Phases','Enrollment','Funded Bys','Study Type','Study Designs','Other IDs','Start Date','Primary Completion Date','Completion Date','First Posted',
            'Results First Posted','Last Update Posted','Locations','Study Documents','URL','contact'];
            fs.writeFile(`${inputPath}/records.csv`, titles, 'utf8', function(err) {
                extract(`${inputPath}/search.zip`, {dir: `${inputPath}/search`}, function (err) {
                    fs.readdir(`${inputPath}/search`, function( err, files ) {
                        let counter = files.length;
                        files.forEach( function( file, index ) {
                            fs.readFile(`${inputPath}/search/${file}`, (err, data) => {
                                if (err) throw err;
                                let record = parseXML(data);
                                record = record.clinical_study;
                                let parsedRecord = record.rank+","+ record.id_info.nct_id+","
                                +'"'+ record.brief_title+'"'+","
                                +'"'+ record.brief_summary.textblock.replace(/"/g,"'")+'"'+','
                                + (record.acronym || '')+","+ record.overall_status+','
                                +'"'+record.condition+'"'+','
                                +'"'+record.intervention+'"'+
                                ','+'"'+record.sponsors.lead_sponsor.agency+'"'+','+record.eligibility.gender+','+record.eligibility.minimum_age+','+record.eligibility.maximum_age+','+'Phases'+','+record.enrollment._+','+'Funded Bys'+','+'Study Type'+','+'Study Designs'+','+'Other IDs'+','+'Start Date'+','+'Primary Completion Date'+','+'Completion Date'+','+'First Posted'+','
                                +'Results First Posted'+','
                                +'"'+ record.last_update_posted._+'"' +','
                                +'"'+getLocation(record.location)+'"'
                                +','+'Study Documents'+','+'URL'+','
                                +'"'+(record.overall_contact ? record.overall_contact.last_name : '')+'"';
                                fs.appendFile(`${inputPath}/records.csv`, `\n${parsedRecord}`, function (err) {
                                    if (err) throw err;
                                    counter--;
                                    if (counter === 0) {
                                        return resolve('saved');
                                    }
                                  });
                            });
                        
                        });
                    });
                })
            });
            
        });
    });
}

ImportFromApi.prototype.getResults = function(i) {
    return this.httpGetAsync1("https://clinicaltrials.gov/ct2/download_studies?cond=Stroke&Search=Apply&recrs=a&recrs=f&cntry1=NA:US&down_count="+limit+"&down_fmt=csv&down_chunk="+i+"&down_flds=all", false, true).then(result => result);  
}

ImportFromApi.prototype.count = function() {
    return this.httpGetAsync("https://clinicaltrials.gov/ct2/results/download_fields?cond=Stroke&Search=Apply&recrs=a&recrs=f&cntry1=NA:US&down_count=1&down_fmt=xml&down_chunk=1").then(result => result.search_results.count);
}

ImportFromApi.prototype.start = function(req,res,next) {
    let self = this;
    console.log('curl -XDELETE ' + this.config.elastic.host + ':' + this.config.elastic.port + '/reindex-records')
    shell.exec('curl -XDELETE ' + this.config.elastic.host + ':' + this.config.elastic.port + '/reindex-records', function(err, result){
        shell.exec(`sh ${toolsPath}/recordsMapping.sh`);
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
            let sourceFile = `${inputPath}/records.csv`;
            self.mongoImport(sourceFile, {'locationString': 'Locations', 'id': 'NCT Number'}).then(err => {
                if (err) return res.status(400).send(err.message);
                next();
            });
        });
    });
} 

ImportFromApi.prototype.status = function(req, res, next) {
    res.send({now: new Date()})
}
  
module.exports = ImportFromApi;
