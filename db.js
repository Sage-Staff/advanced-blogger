const dotenv = require('dotenv')
dotenv.config()
const mongodb = require('mongodb')

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new mongodb.MongoClient(process.env.CONNECTIONSTRING,  {
    serverApi: {
        version: mongodb.ServerApiVersion.v1,
        strict: false,
        deprecationErrors: true,
    }
}
);

async function run() {
try {
// Connect the client to the server (optional starting in v4.7)
await client.connect()
console.log("connected")
// Send a ping to confirm a successful connection
module.exports = await client
const app = require('./app')
app.listen(process.env.PORT)

} catch (error) {
console.error("Error connecting to MongoDB:", error);
}
}
run()