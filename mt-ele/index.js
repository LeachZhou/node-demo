const express = require('express');
const app = express();
const superagent = require('superagent');//用来发起请求
const Entities = require('html-entities').XmlEntities; //形如;&#x5B89;&#x5353;&#x7AEF;转码
const entities = new Entities();
const async = require('async');//并发
const cheerio = require('cheerio'); //抓取页面模块
const iconv = require('iconv-lite');
require('superagent-charset')(superagent);//防止爬取下来的数据乱码，更改字符格式
require('superagent-proxy')(superagent); //代理IP
require("opener")('http://127.0.0.1:3000'); //自动打开浏览器
const util = require("./util");
const sqlUtil = require("./sql");
const params = require("./params");
const userAgents = require("./userAgent");
const userAgent = userAgents[parseInt(Math.random() * userAgents.length)];

let addSql = 'INSERT INTO list(title,address,imageUrl,aid,areaname) VALUES(?,?,?,?,?)';
let proxyAddSql = 'INSERT INTO proxy(url) VALUES(?)';
let modSql = 'UPDATE list SET phone = ? WHERE aid = ?';


// util.proxySlide(proxyAddSql);
//
// return false

// superagent
//     .get('https://www.meituan.com/meishi/158714218')
//     .set({'User-Agent': userAgent})
//     // .redirects(0)
//     .end((err, ret) => {
//         var $ = cheerio.load(ret.text);
//         console.log(`${entities.decode($('html').html())}++++++++++`)
//     });

//关注接口url及参数
let followUrl = `https://www.meituan.com/cate/`;  //商家页面

// 美团列表url及参数
let listUrl = 'https://apimobile.meituan.com/group/v4/poi/pcsearch/1089';


let followFuncCurrencyCount = 0;//商家并发数
let followFunc = (reqUrl, callback) => {
    let url = reqUrl;
    followFuncCurrencyCount++;
    console.log(`现在的商家并发数是${followFuncCurrencyCount}`);
    return new Promise((resolve, reject) => {
        superagent.get(url).buffer(true)
            .end(async (err, ret) => {
                followFuncCurrencyCount--;
                // console.log(followFuncCurrencyCount);
                var $ = cheerio.load(ret.text);
                let text = $('.seller-info-body').html();
                // let text = $('.seller-info-body .item').eq(1).find('span').eq(1).text();
                // console.log(`${ret.text}++++++++++`)
                let modSqlParams = [text, url.split(followUrl)[1]];
                let updateSqlUtil = new sqlUtil();
                await updateSqlUtil.query(modSql, modSqlParams);
                resolve({code: 200, msg: "", data: text});
                reject({code: 400, msg: "", data: err});
                callback();
            });
    });
}
let followeeFuncCurrencyCount = 0;//列表并发数
let followeeFunc = (reqUrl, callback) => {
    let url = reqUrl;
    followeeFuncCurrencyCount++;
    console.log(`现在的列表并发数是${followeeFuncCurrencyCount}`);
    return new Promise((resolve, reject) => {
        superagent.get(url).buffer(true)
            .end((err, ret) => {
                followeeFuncCurrencyCount--;
                // console.log(JSON.parse(ret.text).d)
                console.log(`获取到列表`);
                let items = [...JSON.parse(ret.text).data.searchResult];
                resolve({code: 200, msg: "", data: items});
                reject({code: 400, msg: "", data: err});
                callback(ret.text);
            });
    });
}

app.get('/', function (req, res) {
    //设置请求头
    res.header("Access-Control-Allow-Origin", "*");
    res.header('Access-Control-Allow-Methods', 'PUT, GET, POST, DELETE, OPTIONS');
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Content-Type', 'application/json');
    res.header('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.102 Safari/537.36');
    res.header('Origin', 'https://qidongxian.meituan.com');
    res.header('Host', 'www.meituan.com');
    res.header('Referer', 'https://qidongxian.meituan.com/s/%E9%99%84%E8%BF%91/');

    let followeeFuncUrlArr = [];
    for (let i = 1; i < 33; i++) {
        followeeFuncUrlArr.push(`${listUrl}?${params({
            'uuid': '1d6abe4902074e3795d5.1545787314.1.0.0',
            'userid': '-1',
            'limit': '32',
            'offset': '32' * i,
            'cateId': '-1',
            'q': '附近'
        })}`);
    }
    let wh = () => {
        async.mapLimit(followeeFuncUrlArr, 1, (url, callback) => {
            (async () => {
                let data = await followeeFunc(url, callback);
                let datadata = data.data;
                if (!datadata.length) {
                    console.log(`结束了，快看看结果吧`);
                    throw 'exit';
                    return false;
                }
                let followFuncUrlArr = [];
                let num = 1;
                async.each(datadata, async (item, callback) => {
                    followFuncUrlArr.push(`${followUrl}${item.id}`);
                    let addSqlParams = [item.title, item.address, item.imageUrl, item.id, item.areaname];
                    let addSqlUtil = new sqlUtil();
                    await addSqlUtil.query(addSql, addSqlParams); //这个回调告诉each函数，这个异步操作完成，如果去掉这个函数，each他就不知道这些函数是否成功执行完成
                }, (err) => {
                    // 所有SQL执行完成后回调
                    if (err) {
                        console.log(err);
                    } else {
                        console.log("插入数据库全部执行成功");
                    }
                })
                async.mapLimit(followFuncUrlArr, 1, async (url, callback) => {
                    console.log(`查看第${num}个商家`)
                    await followFunc(url, callback);
                    num++;
                    // util.sleep(2);
                }, (err, result) => {
                    console.log(`查看商家成功`);
                });
            })()
        }, (err, result) => {
            console.log("查看列表成功");
        });
    };

    wh();

});
var server = app.listen(3000);