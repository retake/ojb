var frisby = require('/home/ubuntu/.nvm/versions/node/v4.3.2/lib/node_modules/frisby');

frisby.create("サンプル")
    .get('http://localhost:8080/')
    .expectStatus(200)
    .expectHeader('Content-Type','application/json')
    .expectJSONTypes({
        api_status: String,
        ans: String
    })
    .afterJSON(function(data){

        var ans = data.ans;
        expect(ans).toEqual('7');
    })
.toss();