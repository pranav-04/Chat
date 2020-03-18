const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const bodyParser = require('body-parser')
const expressValidator = require('express-validator');
const flash = require('connect-flash');
const session = require('express-session');
const config = require('./config/database');
const passport = require('passport');
const socket = require('socket.io');
const http = require('http');

mongoose.connect(config.database, { useUnifiedTopology: true, useNewUrlParser: true });
let db = mongoose.connection;

//check connections
db.once('open', () => console.log('Connected to MongoDB'));

//check for DB errors
db.on('error', err => console.log(err));

const app = express();

//Bring in models
let User = require('./models/user');
let Chat = require('./models/chat');

//Load view engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))

// parse application/json
app.use(bodyParser.json())

//Set public folder
app.use(express.static(path.join(__dirname, 'public')));

//Express session middleware
app.use(session({
    secret: 'keyboard cat',
    resave: true,
    saveUninitialized: true
}));

//express messages middleware
app.use(require('connect-flash')());
app.use(function (req, res, next) {
  res.locals.messages = require('express-messages')(req, res);
  next();
});

//express validator middleware
app.use(expressValidator({
    errorFormatter: function(param, msg, value) {
        var namespace = param.split('.')
        , root    = namespace.shift()
        , formParam = root;
  
      while(namespace.length) {
        formParam += '[' + namespace.shift() + ']';
      }
      return {
        param : formParam,
        msg   : msg,
        value : value
      };
    }
}));

//Passport config
require('./config/passport')(passport);

//Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Socket.io integration with express
const server = http.createServer(app);

// Creating the socket
const io = socket(server);

//For all routes
app.get('*', (req, res , next) =>{
  res.locals.user = req.user || null; // this will make user visible to views
  next();
});

//Home route
app.get('/', (req, res) => {
    User.find({}, (err, users) => {
        if(err) console.log(err);
        else{
            res.render('index', {
                title: 'Users',
                users: users
            });
        }
    });
});

//for chats
app.get('/chats/:id', (req, res) => {
    User.findById(req.params.id, (err, user) => {
        if(err) console.log(err);
        else{
            console.log(user._id);
            let query = {
                $or:[
                {from:user._id, to:req.user._id},
                {from:req.user._id, to:user._id}
                ]
            };
            Chat.find(query, (err, chats) => {
                if(err) console.log(err);
                else{
                    res.render('chat', {
                        chatWith: {
                            _id: String(user._id),
                            username: user.username
                        },
                        liUser: {
                            _id: String(req.user._id),
                            username: req.user.username
                        }
                    });
                    //socket.emit('output', chats);
                }
            });
        }
    });
});

//Routes users
let users = require('./routes/users');
app.use('/users', users);

//For chat
io.sockets.on('connection', (socket) => {

    //Handle input events
    socket.on('input', (data) => {
        let from= data.from;
        let to = data.to;
        let body = data.body;

        //Check for name and message
        if(body != ''){
            //insert message 
            let newChat = new Chat({from: from, to: to, body: body});
            newChat.save((err) => {
                if(err) console.log(err);
                else
                io.sockets.in(socket.room).emit('output', [data]);
            });
        }
    });

    //Handle clear
    socket.on('clear', (data) => {
        //Remove all chats from the connection
        Chat.remove({}, () => {
            //Emit cleared
            io.sockets.in(socket.room).emit('cleared');
        });
    });
});

const port = 5000;

server.listen(port, () => {
  console.log(
    `Server is running in ${process.env.NODE_ENV} mode on port ${port}...`
  )
});