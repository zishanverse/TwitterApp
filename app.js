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

const initialization = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(4000, () => {
      console.log("server is running... :)");
    });
  } catch (error) {
    console.log(`DB ERROR: ${error.message}`);
  }
};
initialization();

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const checkUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const foundUser = await db.get(checkUserQuery);

  if (foundUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else if (password.length < 6) {
    response.status(400);
    response.send("Password is too short");
  } else {
    const hashPassword = await bcrypt.hash(password, 10);
    const query = `
        INSERT INTO user (name, username, password, gender)
        VALUES (
            '${name}',
            '${username}',
            '${hashPassword}',
            '${gender}'
        );`;
    await db.run(query);
    response.status(200);
    response.send("User created successfully");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const checkUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const foundUser = await db.get(checkUserQuery);

  if (foundUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const checkPassword = await bcrypt.compare(password, foundUser.password);

    if (checkPassword === false) {
      response.status(400);
      response.send("Invalid password");
    } else {
      const payload = { username: username };
      const jwtoken = jwt.sign(payload, "MY_SECRET");
      response.send({ jwtToken: jwtoken });
    }
  }
});

const authorization = (request, response, next) => {
  const auth = request.headers["authorization"];
  let jwtoken;
  if (auth !== undefined) {
    jwtoken = auth.split(" ")[1];
  }
  if (jwtoken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtoken, "MY_SECRET", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

app.get("/user/tweets/feed/", authorization, async (request, response) => {
  const username = request.username;
  const userDetailsQuery = `
  SELECT * FROM user WHERE username = '${username}';`;
  const userDetails = await db.get(userDetailsQuery);
  const query = `
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
  const result = await db.all(query);
  response.send(result);
});

app.get("/user/following/", authorization, async (request, response) => {
  const username = request.username;
  const userDetailsQuery = `
  SELECT * FROM user WHERE username = '${username}';`;
  const userDetails = await db.get(userDetailsQuery);

  const query = `
  SELECT user.name
  FROM follower INNER JOIN user ON user.user_id = follower.following_user_id
  WHERE follower.follower_user_id = ${userDetails.user_id};`;
  const result = await db.all(query);
  response.send(result);
});

app.get("/user/followers/", authorization, async (request, response) => {
  const username = request.username;
  const userDetailsQuery = `
    SELECT * FROM user WHERE username = '${username}';`;
  const userDetails = await db.get(userDetailsQuery);

  const query = `
    SELECT user.name
    FROM follower INNER JOIN user ON follower.follower_user_id = user.user_id
    WHERE follower.following_user_id = ${userDetails.user_id};`;
  const result = await db.all(query);
  response.send(result);
});

app.get("/tweets/:tweetId/", authorization, async (request, response) => {
  const { tweetId } = request.params;
  const username = request.username;
  const userDetailsQuery = `
    SELECT * FROM user WHERE username = '${username}';`;
  const userDetails = await db.get(userDetailsQuery);

  const tweetDetailsQuery = `
  SELECT * FROM tweet WHERE tweet_id = ${tweetId};`;
  const tweetDetails = await db.get(tweetDetailsQuery);

  const query = `SELECT * FROM follower INNER JOIN user ON user.user_id = follower.following_user_id
  WHERE follower.follower_user_id = ${userDetails.user_id};`;
  const allTweets = await db.all(query);
  if (
    allTweets.some((each) => each.following_user_id === tweetDetails.user_id)
  ) {
    const tweetQuery = `
  SELECT 
    tweet.tweet,
    (SELECT COUNT(*) FROM like WHERE tweet_id= ${tweetId}) AS likes,
    (SELECT COUNT(*) FROM reply WHERE tweet_id= ${tweetId}) AS replies,
    tweet.date_time AS dateTime
  FROM follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id
  INNER JOIN like ON tweet.tweet_id = like.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
  WHERE follower.follower_user_id = ${userDetails.user_id}
  AND tweet.tweet_id = ${tweetId}
  GROUP BY tweet.tweet_id;`;

    const result = await db.get(tweetQuery);
    response.send(result);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

app.get("/tweets/:tweetId/likes/", authorization, async (request, response) => {
  const { tweetId } = request.params;
  const username = request.username;
  const userDetailsQuery = `
    SELECT * FROM user WHERE username = '${username}';`;
  const userDetails = await db.get(userDetailsQuery);

  const tweetDetailsQuery = `
  SELECT * FROM tweet WHERE tweet_id = ${tweetId};`;
  const tweetDetails = await db.get(tweetDetailsQuery);

  const query = `SELECT * FROM follower INNER JOIN user ON user.user_id = follower.following_user_id
  WHERE follower.follower_user_id = ${userDetails.user_id};`;
  const allTweets = await db.all(query);
  if (
    allTweets.some((each) => each.following_user_id === tweetDetails.user_id)
  ) {
    const query = `
  SELECT 
    user.name
  FROM follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id
  INNER JOIN like ON tweet.tweet_id = like.tweet_id INNER JOIN user ON like.user_id = user.user_id
  WHERE follower.follower_user_id = ${userDetails.user_id}
  AND tweet.tweet_id = ${tweetId}
  ORDER BY user.name;`;

    const result = await db.all(query);
    console.log(result);
    const l = result.length;
    const list = [];
    for (let i = 0; i < l; i++) {
      list.push(result[i].name);
    }
    response.send({ likes: list });
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

app.get(
  "/tweets/:tweetId/replies/",
  authorization,
  async (request, response) => {
    const { tweetId } = request.params;
    const username = request.username;
    const userDetailsQuery = `
    SELECT * FROM user WHERE username = '${username}';`;
    const userDetails = await db.get(userDetailsQuery);

    const query = `
  SELECT 
    user.name,
    reply.reply
  FROM follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id
  INNER JOIN reply ON tweet.tweet_id = reply.tweet_id INNER JOIN user ON reply.user_id = user.user_id
  WHERE follower.follower_user_id = ${userDetails.user_id}
  AND tweet.tweet_id = ${tweetId};`;

    const result = await db.all(query);
    if (result.length === 0) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send({ replies: result });
    }
  }
);

app.get("/user/tweets/", authorization, async (request, response) => {
  const username = request.username;
  const userDetailsQuery = `
    SELECT * FROM user WHERE username = '${username}';`;
  const userDetails = await db.get(userDetailsQuery);

  const query = `
    SELECT 
        tweet.tweet AS tweet,
        COUNT(like.like_id) AS likes,
        COUNT(reply.reply) AS replies,
        tweet.date_time AS dateTime
    FROM tweet INNER JOIN like ON like.tweet_id = tweet.tweet_id
        INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
    WHERE tweet.user_id = ${userDetails.user_id}
    GROUP BY tweet.user_id;`;

  const result = await db.all(query);
  response.send(result);
});

app.post("/user/tweets/", authorization, async (request, response) => {
  const { tweet } = request.body;
  const username = request.username;
  const userDetailsQuery = `
        SELECT * FROM user WHERE username = '${username}';`;
  const userDetails = await db.get(userDetailsQuery);
  const date = new Date();
  console.log(date);
  const query = `
    INSERT INTO tweet (tweet, user_id, date_time)
    VALUES (
        '${tweet}',
        ${userDetails.user_id},
        '${userDetails.date_time}'
    );`;
  await db.run(query);
  response.send("Created a Tweet");
});

app.delete("/tweets/:tweetId/", authorization, async (request, response) => {
  const { tweetId } = request.params;
  const username = request.username;
  const userDetailsQuery = `
        SELECT * FROM user WHERE username = '${username}';`;
  const userDetails = await db.get(userDetailsQuery);

  const query = `
    DELETE FROM tweet
    WHERE tweet_id = ${tweetId}
    AND user_id = ${userDetails.user_id};`;

  const result = await db.run(query);

  if (result.changes === 0) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    console.log(result);
    response.send("Tweet Removed");
  }
});

module.exports = app;
