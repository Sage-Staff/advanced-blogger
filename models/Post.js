const postCollection = require('../db').db("ComplexApp").collection('posts')
const followsCollection = require('../db').db("ComplexApp").collection('follows')
const ObjectID  = require('mongodb').ObjectId
const User = require('./User')
const sanitizeHTML = require('sanitize-html')

let Post = function(data, userid, requestedPostId){
    this.data = data
    this.errors = []
    this.userid = userid
    this.requestedPostId = requestedPostId
}

Post.prototype.cleanUp = function(){
    if(typeof(this.data.title) != "string"){this.data.title == ""}
    if(typeof(this.data.body) != "string"){this.data.body == ""}

    //get rid of any bogus properties
    this.data = {
        title: sanitizeHTML(this.data.title.trim(), {allowedTags: [], allowedAttributes: {}}),
        body: sanitizeHTML(this.data.body.trim(), {allowedTags: [], allowedAttributes: {}}),
        createDate: new Date(),
        author: new ObjectID(this.userid)
    }
}

Post.prototype.validate = function(){
    
    if(this.data.title == ""){this.errors.push("You must provide a title.")}
    if(this.data.body == ""){this.errors.push("You must provide a post content.")}
    
}

Post.prototype.create = function(){
    return new Promise((resolve, reject) => {
        this.cleanUp()
        this.validate()
        if(!this.errors.length){
            postCollection.insertOne(this.data).then((info) => {
                resolve(info.insertedId)
            }).catch(() => {
                this.errors.push("Please try again later.")
                reject(this.errors)
            })
        }else{
            reject(this.errors)
        }
    })
}

Post.prototype.update = function(){
    return new Promise(async (resolve, reject) => {
        try{
            let post = await Post.findSingleById(this.requestedPostId, this.userid)
            if(post.isVisitorOwner){
                //actually update the db
                let status = this.actuallyUpdate()
                resolve(status)
            }else{
                reject()
            }
        }catch{
            reject()
        }
    })
}

Post.prototype.actuallyUpdate = function(){
    return new Promise(async (resolve, reject) => {
        this.cleanUp()
        this.validate()
        if(!this.errors.length){
            await postCollection.findOneAndUpdate({_id: new ObjectID(this.requestedPostId)}, {$set: {title: this.data.title, body: this.data.body}})
            resolve("success")
        }else{
            reject("failure")
        }
    })
}

Post.reuseablePostQuery = function(uniqueOperations, visitorId, finalOperations = []){
    return new Promise(async function(resolve, reject){
        
        let aggOperations = uniqueOperations.concat([
            {$lookup: {from: "users", localField: "author", foreignField: "_id", as: "authorDocument"}},
            {$project: {
                title: 1,
                body: 1,
                createDate: 1,
                authorId: "$author",
                author: {$arrayElemAt: ["$authorDocument", 0]}
            }}
        ]).concat(finalOperations)


        let posts = await postCollection.aggregate(aggOperations).toArray()

        //cleanup author property for each post object
        posts = posts.map(function(post){
            post.isVisitorOwner = post.authorId.equals(visitorId)
            post.authorId = undefined
            post.author = {
                username: post.author.username,
                avatar: new User(post.author, true).avatar
            }
            return post
        })
        resolve(posts)
    })
}

Post.findSingleById = function(id, visitorId){
    return new Promise(async function(resolve, reject){
        if(typeof(id) != "string" || !ObjectID.isValid(id)){
            reject()
            return
        }
        let posts = await Post.reuseablePostQuery([
            {$match: {_id: new ObjectID(id)}}
        ], visitorId)

        if(posts.length){
            resolve(posts[0])
        }else{
            reject()
        }
    })
}

Post.findByAuthorId = function(authorId){

    return Post.reuseablePostQuery([
        {$match: {author: authorId}},
        {$sort: {createDate: -1}}
    ])

}

Post.delete = function(postIdToDelete, currentUserId){
    return new Promise(async (resolve, reject) => {
        try{
            let post = await Post.findSingleById(postIdToDelete, currentUserId)
            if(post.isVisitorOwner){
                await postCollection.deleteOne({_id: new ObjectID(postIdToDelete)})
                resolve()
            }else{
                reject()
            }
        }catch{
            reject()
        }
    })
}

Post.searchPosts = function(uniqueOperations){

    return new Promise(async function(resolve, reject){
        
        let aggOperations = uniqueOperations.concat([
            {$project: {
                title: 1,
                body: 1,
                createDate: 1
            }}
        ])

        let posts = await postCollection.aggregate(aggOperations).toArray()

        resolve(posts)
    })

}
Post.search = function(searchTerm){
    return new Promise(async (resolve, reject) => {
        if(typeof(searchTerm) == "string"){
            let posts = await Post.reuseablePostQuery([
                {
                    $search: {
                    index: "search-posts",
                    text: {
                        query: searchTerm,
                        path: {
                        wildcard: "*"
                        }
                    }
                    }
                }
            ])
            resolve(posts)
        }else{
            reject()
        }
    })
}

Post.countPostsByAuthor = function(id){
    return new Promise(async (resolve, reject) => {
        let postCount = await postCollection.countDocuments({author: id})
        resolve(postCount)
    })
}

Post.getFeed = function(id){
    return new Promise(async (resolve, reject) => {
        //create an array of the user ids that current users follows
        let followedUsers = await followsCollection.find({authorId: new ObjectID(id)}).toArray()
        followedUsers = followedUsers.map(function(followDoc){
                return followDoc.followedId
        })

        //look for posts where the author is in the above array of followed users
        let posts = await Post.reuseablePostQuery([
            {$match: {author: {$in: followedUsers}}},
            {$sort: {createDate: -1}}
        ]) 
        resolve(posts)
    })
}

module.exports = Post