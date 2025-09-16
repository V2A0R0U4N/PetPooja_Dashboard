// const express = require('express');
// const { MongoClient } = require('mongodb');
// const cors = require('cors');
// const http = require('http');
// const { Server } = require("socket.io");
// require('dotenv').config();

// const app = express();
// const server = http.createServer(app);

// const io = new Server(server, {
//     cors: {
//         origin: "http://localhost:8080", // Your frontend's port
//         methods: ["GET", "POST"]
//     }
// });

// const port = process.env.PORT || 5000;

// app.use(cors());
// app.use(express.json());

// const uri = process.env.MONGO_URI;
// const client = new MongoClient(uri);

// async function run() {
//     try {
//         await client.connect();
//         console.log("Connected to MongoDB Atlas");

//         const database = client.db("test");
//         const collection = database.collection("agentlogs");

//         // --- Real-time updates with Change Streams ---
//         const changeStream = collection.watch();
//         changeStream.on('change', (next) => {
//             console.log("Database change detected, emitting 'dashboardUpdate' event...");
//             io.emit('dashboardUpdate', { message: "Data has been updated" });
//         });

//         // --- Single, Efficient API Endpoint for all Dashboard Data ---
//         app.get('/api/dashboard-data', async (req, res) => {
//             try {
//                 const [kpiData] = await collection.aggregate([
//                     {
//                         $group: {
//                             _id: null,
//                             totalUsers: { $addToSet: "$user_email" },
//                             totalSessions: { $addToSet: "$session_id" },
//                             totalRestaurants: { $addToSet: "$restaurant_id" },
//                             totalQueries: { $sum: 1 },
//                             totalTokens: { $sum: "$token_usage.petpooja_dashboard.query_reformer_token_usage.total_tokens" }, // Example, adjust as needed
//                             avgResponseTime: { $avg: "$time.total_time" },
//                             successCount: { $sum: { $cond: [{ $eq: ["$status", true] }, 1, 0] } }
//                         }
//                     },
//                     {
//                         $project: {
//                             _id: 0,
//                             totalUsers: { $size: "$totalUsers" },
//                             totalSessions: { $size: "$totalSessions" },
//                             restaurants: { $size: "$totalRestaurants" },
//                             avgQueriesPerSession: { $divide: ["$totalQueries", { $ifNull: [{ $size: "$totalSessions" }, 1] }] },
//                             successRatio: { $multiply: [{ $divide: ["$successCount", "$totalQueries"] }, 100] },
//                             totalTokens: "$totalTokens",
//                             avgResponseTime: { $round: ["$avgResponseTime", 0] }
//                         }
//                     }
//                 ]).toArray();

//                 const requestDistribution = await collection.aggregate([
//                     { $unwind: "$petpooja_dashboard.request_type_identifier" },
//                     { $group: { _id: "$petpooja_dashboard.request_type_identifier.raw_output", value: { $sum: 1 } } },
//                     { $project: { name: "$_id", value: 1, _id: 0 } }
//                 ]).toArray();

//                 const statusData = await collection.aggregate([
//                     { $group: { _id: { $cond: { if: { $eq: ["$status", true] }, then: "Success", else: "Failed" } }, value: { $sum: 1 } } },
//                     { $project: { name: "$_id", value: 1, _id: 0 } }
//                 ]).toArray();

//                 const routeDistribution = await collection.aggregate([
//                     { $unwind: "$petpooja_dashboard.query_router.query_router_processed_results.tasks" },
//                     { $group: { _id: "$petpooja_dashboard.query_router.query_router_processed_results.tasks.route", count: { $sum: 1 } } },
//                     { $sort: { count: -1 } },
//                     { $limit: 5 },
//                     { $project: { route: "$_id", count: 1, _id: 0 } }
//                 ]).toArray();

//                 const responseTimes = await collection.aggregate([
//                     { $addFields: { query_hour: { $hour: { $toDate: "$query_time" } } } },
//                     { $group: { _id: "$query_hour", avg: { $avg: "$time.total_time" } } },
//                     { $sort: { "_id": 1 } },
//                     { $project: { time: { $concat: [{ $cond: { if: { $lt: ["$_id", 10] }, then: "0", else: "" } }, { $toString: "$_id" }, ":00"] }, avg: { $round: ["$avg", 0] }, _id: 0 } }
//                 ]).toArray();

//                 const geographicData = await collection.aggregate([
//                     { $group: { _id: "$currency_html_code", requests: { $sum: 1 } } },
//                     { $sort: { requests: -1 } },
//                     { $limit: 5 },
//                     { $project: { country: "$_id", requests: 1, _id: 0 } }
//                 ]).toArray();

//                 const topRestaurants = await collection.aggregate([
//                     { $group: { _id: "$restaurant_id", queries: { $sum: 1 } } },
//                     { $sort: { queries: -1 } },
//                     { $limit: 5 },
//                     { $project: { id: "$_id", name: { $concat: ["Restaurant ", "$_id"] }, queries: 1, _id: 0 } }
//                 ]).toArray();

//                 res.json({
//                     kpis: kpiData,
//                     requestDistribution,
//                     statusData,
//                     routeDistribution,
//                     responseTimes,
//                     geographicData,
//                     topRestaurants,
//                 });

//             } catch (error) {
//                 res.status(500).json({ message: error.message });
//             }
//         });

//         server.listen(port, () => {
//             console.log(`Server is running on port: ${port}`);
//         });

//     } catch (err) {
//         console.error(err)
//     }
// }

// run().catch(console.dir);

const { MongoClient } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

async function run() {
    try {
        await client.connect();
        console.log("✅ Successfully connected to MongoDB Atlas!");

        const database = client.db("test");
        const collection = database.collection("agentlogs");

        console.log("\n--- Verifying Dashboard Data Queries ---");

        // 1. KPIs
        const [kpiData] = await collection.aggregate([
            {
                $group: {
                    _id: null,
                    totalUsers: { $addToSet: "$user_email" },
                    totalSessions: { $addToSet: "$session_id" },
                    totalRestaurants: { $addToSet: "$restaurant_id" },
                    totalQueries: { $sum: 1 },
                    totalTokens: { $sum: "$token_usage.petpooja_dashboard.query_reformer_token_usage.total_tokens" },
                    avgResponseTime: { $avg: "$time.total_time" },
                    successCount: { $sum: { $cond: [{ $eq: ["$status", true] }, 1, 0] } }
                }
            },
            {
                $project: {
                    _id: 0,
                    totalUsers: { $size: "$totalUsers" },
                    totalSessions: { $size: "$totalSessions" },
                    restaurants: { $size: "$totalRestaurants" },
                    avgQueriesPerSession: { $divide: ["$totalQueries", { $ifNull: [{ $size: "$totalSessions" }, 1] }] },
                    successRatio: { $multiply: [{ $divide: ["$successCount", "$totalQueries"] }, 100] },
                    totalTokens: "$totalTokens",
                    avgResponseTime: { $round: ["$avgResponseTime", 0] }
                }
            }
        ]).toArray();
        console.log("\n📊 KPIs Data:");
        console.log(kpiData || "No KPI data found.");

        // 2. Request Distribution
        const requestDistribution = await collection.aggregate([
            { $unwind: "$petpooja_dashboard.request_type_identifier" },
            { $group: { _id: "$petpooja_dashboard.request_type_identifier.raw_output", value: { $sum: 1 } } },
            { $limit: 3 },
            { $project: { name: "$_id", value: 1, _id: 0 } }
        ]).toArray();
        console.log("\n📊 Request Distribution (First 3):");
        console.log(requestDistribution);

        // 3. Status Ratio
        const statusData = await collection.aggregate([
            { $group: { _id: { $cond: { if: { $eq: ["$status", true] }, then: "Success", else: "Failed" } }, value: { $sum: 1 } } },
            { $project: { name: "$_id", value: 1, _id: 0 } }
        ]).toArray();
        console.log("\n📊 Status Ratio:");
        console.log(statusData);

        // 4. Route Distribution
        const routeDistribution = await collection.aggregate([
            { $unwind: "$petpooja_dashboard.query_router.query_router_processed_results.tasks" },
            { $group: { _id: "$petpooja_dashboard.query_router.query_router_processed_results.tasks.route", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 3 },
            { $project: { route: "$_id", count: 1, _id: 0 } }
        ]).toArray();
        console.log("\n📊 Route Distribution (First 3):");
        console.log(routeDistribution);

        // 5. Response Times by Hour
        const responseTimes = await collection.aggregate([
            { $addFields: { query_hour: { $hour: { $toDate: "$query_time" } } } },
            { $group: { _id: "$query_hour", avg: { $avg: "$time.total_time" } } },
            { $sort: { "_id": 1 } },
            { $limit: 3 },
            { $project: { time: { $concat: [{ $cond: { if: { $lt: ["$_id", 10] }, then: "0", else: "" } }, { $toString: "$_id" }, ":00"] }, avg: { $round: ["$avg", 0] }, _id: 0 } }
        ]).toArray();
        console.log("\n📊 Response Times by Hour (First 3):");
        console.log(responseTimes);

        // 6. Geographic Data
        const geographicData = await collection.aggregate([
            { $group: { _id: "$currency_html_code", requests: { $sum: 1 } } },
            { $sort: { requests: -1 } },
            { $limit: 3 },
            { $project: { country: "$_id", requests: 1, _id: 0 } }
        ]).toArray();
        console.log("\n📊 Geographic Data (First 3):");
        console.log(geographicData);

        // 7. Top Restaurants
        const topRestaurants = await collection.aggregate([
            { $group: { _id: "$restaurant_id", queries: { $sum: 1 } } },
            { $sort: { queries: -1 } },
            { $limit: 3 },
            { $project: { id: "$_id", name: { $concat: ["Restaurant ", "$_id"] }, queries: 1, _id: 0 } }
        ]).toArray();
        console.log("\n📊 Top Restaurants (First 3):");
        console.log(topRestaurants);


    } catch (err) {
        console.error("An error occurred:", err);
    } finally {
        await client.close();
        console.log("\nConnection closed.");
    }
}

run();