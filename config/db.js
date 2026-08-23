const mongoose = require('mongoose');

const MONGODB_URI = (
  process.env.MONGODB_URI ||
  process.env.MONGODB_URL ||
  process.env.MONGO_URI ||
  process.env.MONGO_URL ||
  process.env.mongodb_url ||
  'mongodb://127.0.0.1:27017/mickey_water'
).trim();
let connectionPromise;

if (!MONGODB_URI) {
  throw new Error('MONGODB_URI haijawekwa kwenye environment variables');
}

async function connectDB() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (connectionPromise) return connectionPromise;

  connectionPromise = mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    maxPoolSize: 10,
    minPoolSize: 1,
    family: 4
  }).then(() => {
    console.log('MongoDB imeunganishwa.');
    return mongoose.connection;
  }).catch(error => {
    connectionPromise = undefined;
    console.error('MongoDB connection failed:', error.message);
    throw error;
  });

  return connectionPromise;
}

function databaseStatus() {
  return {
    state: mongoose.connection.readyState,
    connected: mongoose.connection.readyState === 1,
    name: mongoose.connection.name || null
  };
}

module.exports = { connectDB, databaseStatus };
