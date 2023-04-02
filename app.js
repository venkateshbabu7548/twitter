const express = require("express");
const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    app.listen(3000, () => {
      console.log("Server running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

const convertStateToCamelCase = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};

const convertDistrictToCamelCase = (dbObject) => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "venkatesh7548", async (error, payLoad) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payLoad.username;
        next();
      }
    });
  }
};

// API 1
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const findUserQuery = `SELECT * FROM user WHERE username = "${username}";`;
  const dbUser = await db.get(findUserQuery);

  if (dbUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const encryptedPassword = await bcrypt.hash(password, 10);
      const addUserQuery = `INSERT INTO user(username,password,name,gender) 
      VALUES("${username}","${encryptedPassword}","${name}","${gender}");`;
      await db.run(addUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  }
});

//API 2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const findUserQuery = `SELECT * FROM user WHERE username = "${username}";`;
  const dbUser = await db.get(findUserQuery);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const encryptedPassword = await bcrypt.compare(password, dbUser.password);
    if (encryptedPassword === true) {
      const payLoad = { username: username };

      const jwtToken = jwt.sign(payLoad, "venkatesh7548");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API 3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  let { username } = request;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const userDetails = await db.get(selectUserQuery);
  const tweetsQuery = `
    SELECT
    user.username, tweet.tweet, tweet.date_time AS dateTime
    FROM
    follower
    INNER JOIN tweet
    ON follower.following_user_id = tweet.user_id
    INNER JOIN user
    ON tweet.user_id = user.user_id
    WHERE
    follower.follower_user_id = ${userDetails.user_id}
    ORDER BY
    tweet.date_time DESC
    LIMIT 4;`;
  const feed = await db.all(tweetsQuery);
  response.send(feed);
});

// API 4
app.get("/user/following/", authenticateToken, async (request, response) => {
  let { username } = request;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const userDetails = await db.get(selectUserQuery);
  const followingQuery = `SELECT user.name FROM user JOIN follower ON user.user_id = follower.following_user_id WHERE follower.follower_user_id = ${userDetails.user_id};`;
  const followingUsers = await db.all(followingQuery);
  response.send(followingUsers);
});

// API 5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  let { username } = request;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const userDetails = await db.get(selectUserQuery);
  const followingQuery = `SELECT user.name FROM user JOIN follower ON user.user_id = follower.follower_user_id WHERE follower.following_user_id = ${userDetails.user_id};`;
  const followingUsers = await db.all(followingQuery);
  response.send(followingUsers);
});

// API 6
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  let { username } = request;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const userDetails = await db.get(selectUserQuery);
  const isUserFollowsQuery = `SELECT * FROM tweet JOIN follower ON tweet.user_id = follower.following_user_id WHERE tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${userDetails.user_id};`;
  const isUserFollows = await db.get(isUserFollowsQuery);
  if (isUserFollows === {}) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const tweetQuery = `SELECT tweet.tweet,COUNT(likes.like_id) AS likes,COUNT(reply.reply_id) AS replies,tweet.date_time AS dateTime FROM tweet JOIN reply ON tweet.tweet_id = reply.tweet_id JOIN like ON like.tweet_id = reply.tweet_id WHERE tweet.tweet_id = ${tweetId};`;
  }
});

module.exports = app;
