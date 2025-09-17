const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");
require('dotenv').config();

const app = express();
const server = http.createServer(app);

const allowedOrigins = ["http://localhost:8080", "http://localhost:8081", "http://localhost:5173"];

const io = new Server(server, {
    cors: {
        origin: function (origin, callback) {
            if (!origin || allowedOrigins.indexOf(origin) !== -1) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        },
        methods: ["GET", "POST"]
    }
});

const port = process.env.PORT || 5000;
app.use(cors());
app.use(express.json());

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

async function run() {
    try {
        await client.connect();
        console.log("✅ Connected to MongoDB Atlas!");

        const database = client.db("test");
        const collection = database.collection("agentlogs");

        const changeStream = collection.watch([], { fullDocument: 'updateLookup' });
        changeStream.on('change', (change) => {
            io.emit('dashboardUpdate', { message: "Data has been updated" });
        });

        // Main endpoint for Overview page - NOW WITH DYNAMIC FILTERING
        app.get('/api/overview-data', async (req, res) => {
            try {
                const { dateRange, requestType, userType } = req.query;

                // --- Build the master filter object ---
                const matchFilter = {};

                if (dateRange && dateRange !== 'custom' && dateRange !== 'all') {
                    const days = parseInt(dateRange.replace('d', ''));
                    if (!isNaN(days)) {
                        const startDate = new Date();
                        startDate.setDate(startDate.getDate() - days);
                        matchFilter.query_time = { $gte: startDate.toISOString() };
                    }
                }
                if (userType && userType !== 'all') {
                    matchFilter.user_type = parseInt(userType);
                }

                const requestTypeMatch = {};
                if (requestType && requestType !== 'all') {
                    requestTypeMatch['petpooja_dashboard.request_type_identifier.raw_output'] = requestType;
                }

                // --- Run all aggregations with the filter applied ---
                const [kpiData] = await collection.aggregate([
                    { $match: matchFilter },
                    { $unwind: "$petpooja_dashboard.request_type_identifier" },
                    { $match: requestTypeMatch },
                    {
                        $group: {
                            _id: null,
                            totalUsers: { $addToSet: "$user_email" },
                            totalQueries: { $sum: 1 },
                            avgResponseTime: { $avg: "$time.total_time" },
                            successCount: { $sum: { $cond: [{ $eq: ["$status", true] }, 1, 0] } }
                        }
                    },
                    {
                        $project: {
                            _id: 0,
                            totalUsers: { $size: "$totalUsers" },
                            totalQueries: "$totalQueries",
                            successRate: { $multiply: [{ $divide: ["$successCount", { $ifNull: ["$totalQueries", 1] }] }, 100] },
                            avgResponseTime: { $round: ["$avgResponseTime", 0] }
                        }
                    }
                ]).toArray();

                const queryVolume = await collection.aggregate([
                    { $addFields: { convertedDate: { $toDate: "$query_time" } } },
                    { $match: { ...matchFilter, convertedDate: matchFilter.query_time ? { $gte: new Date(matchFilter.query_time.$gte) } : { $exists: true } } },
                    { $unwind: "$petpooja_dashboard.request_type_identifier" },
                    { $match: requestTypeMatch },
                    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$convertedDate" } }, count: { $sum: 1 } } },
                    { $sort: { _id: 1 } },
                    { $project: { date: "$_id", queries: "$count", _id: 0 } }
                ]).toArray();

                const [peakHour] = await collection.aggregate([
                    { $match: matchFilter },
                    { $unwind: "$petpooja_dashboard.request_type_identifier" },
                    { $match: requestTypeMatch },
                    { $group: { _id: { $hour: { $toDate: "$query_time" } }, count: { $sum: 1 } } },
                    { $sort: { count: -1 } },
                    { $limit: 1 }
                ]).toArray();

                const [topRequestType] = await collection.aggregate([
                    { $match: matchFilter },
                    { $unwind: "$petpooja_dashboard.request_type_identifier" },
                    { $match: requestTypeMatch },
                    { $group: { _id: "$petpooja_dashboard.request_type_identifier.raw_output", count: { $sum: 1 } } },
                    { $sort: { count: -1 } },
                    { $limit: 1 }
                ]).toArray();

                const requestDistribution = await collection.aggregate([
                    { $match: matchFilter },
                    { $unwind: "$petpooja_dashboard.request_type_identifier" },
                    { $match: requestTypeMatch },
                    { $group: { _id: "$petpooja_dashboard.request_type_identifier.raw_output", value: { $sum: 1 } } },
                    { $project: { name: "$_id", value: 1, _id: 0 } }
                ]).toArray();

                const topRestaurants = await collection.aggregate([
                    { $match: matchFilter },
                    { $unwind: "$petpooja_dashboard.request_type_identifier" },
                    { $match: requestTypeMatch },
                    { $group: { _id: "$restaurant_id", queries: { $sum: 1 } } },
                    { $sort: { queries: -1 } },
                    { $limit: 5 },
                    { $project: { name: { $concat: ["Restaurant ", "$_id"] }, queries: 1, _id: 0 } }
                ]).toArray();

                res.json({
                    kpis: kpiData || { totalUsers: 0, totalQueries: 0, successRate: 0, avgResponseTime: 0 },
                    queryVolume,
                    peakHour: peakHour?._id ?? 'N/A',
                    topRequestType: topRequestType?._id || 'N/A',
                    requestDistribution,
                    topRestaurants
                });

            } catch (error) {
                console.error("Error in /api/overview-data:", error);
                res.status(500).json({ message: error.message });
            }
        });

        app.get('/api/live-feed', async (req, res) => {
            // ... (this endpoint remains the same)
        });

        server.listen(port, () => {
            console.log(`✅ Backend server running at http://localhost:${port}`);
        });

    } catch (err) {
        console.error("❌ Backend startup error:", err)
    }
}

run().catch(console.dir);