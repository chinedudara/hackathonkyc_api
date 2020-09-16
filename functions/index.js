const functions = require("firebase-functions");
const express = require("express");
const cors = require("cors");
const auth = require('./util/auth');

const app = express();
const bvn = express()
app.use(cors({origin: true}));

const {
    getUserDetails,
    loginUser,
    signUpUser,
    uploadPassport,
    uploadUtilityBill,
    verifyBVN,
    validateCode,
    fetchBvnData,
    addBvnData,
    sendApprovalEmail,
} = require('./controllers/user')

app.get("/user", auth, getUserDetails);
app.post("/login", loginUser);
app.post("/signup", signUpUser);
app.post("/user/passport", auth, uploadPassport);
app.post("/user/utility", auth, uploadUtilityBill);
app.post("/verifybvn", auth, verifyBVN);
app.post("/validatecode", auth, validateCode);

// Mock BVN Endpoints
bvn.get("/bvn/:num", fetchBvnData);
bvn.post("/bvn", addBvnData);

// Database Update Trigger (Approve Documents)
exports.approval = functions.firestore.document(`/users/{userId}`).onUpdate(sendApprovalEmail)

exports.api = functions.https.onRequest(app);
exports.infrastructure = functions.https.onRequest(bvn);