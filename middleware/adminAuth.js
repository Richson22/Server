// server/middleware/adminAuth.js
const crypto = require("crypto");

const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE; // set in .env, never in frontend code
const SESSION_SECRET = process.env.SESSION_SECRET;  // random long string, set in .env

function signToken() {
  const expires = Date.now() + 1000 * 60 * 60 * 12; // 12hr session
  const payload = `${expires}`;
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
  if (sig !== expected) return false;
  return Number(payload) > Date.now();
}

function requireAdmin(req, res, next) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (!verifyToken(token)) {
    return res.status(401).json({ error: "Not authorized." });
  }
  next();
}

module.exports = { signToken, verifyToken, requireAdmin, ADMIN_PASSCODE };