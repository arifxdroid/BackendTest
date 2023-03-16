// @ts-nocheck
import * as redis from "redis";

let client;

function createClient() {
  if (!client) {
    client = redis.createClient(process.env.REDIS_URL);
  }

  client.on("connect", () => {
    console.log("Connected to Redis");
  });

  client.on('error', (...err: any) => {
    console.log('Redis Client Error', err)
  });

  return client;
}

export default createClient();