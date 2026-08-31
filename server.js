require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const Space = require("./models/Space");
const Booking = require("./models/Booking");
const Block = require("./models/Block");
const Content = require("./models/Content");
const Gallery = require("./models/Gallery");
const multer = require("multer");
const cloudinary = require("./config/cloudinary");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

function uploadToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "maison-s-galleries" },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });
}
const { signToken, requireAdmin, ADMIN_PASSCODE } = require("./middleware/adminAuth");
const { sendBookingNotification, sendCustomerMessage } = require("./utils/mailer");
const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/maison_s";
const CORS_ORIGIN = (process.env.CORS_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);

const app = express();
app.use(express.json());

const corsOptions = {
  origin: CORS_ORIGIN.length ? CORS_ORIGIN : "*",
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
// ------------------------------------------------------------
// Seed data — matches the original localStorage seed exactly,
// including the fixed space IDs the frontend already expects.
// ------------------------------------------------------------

async function seedIfEmpty() {
  const count = await Space.countDocuments();
  if (count > 0) return;

  await Space.insertMany([
    {
      _id: "space_patio",
      name: "The Patio",
      capacity: 10,
      description: "An intimate outdoor setting for cocktails, brunches and creative gatherings.",
      active: true
    },
    {
      _id: "space_dining",
      name: "The Dining Room",
      capacity: 10,
      description: "An intimate space designed around the table, for private dinners and shared experiences.",
      active: true
    },
    {
      _id: "space_fullhouse",
      name: "Full House",
      capacity: 25,
      description: "The whole home, for larger collaborations and chef series.",
      active: true
    }
  ]);

  console.log("Seeded default spaces: space_patio, space_dining, space_fullhouse");
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// Maison S only hosts Friday (5), Saturday (6), Sunday (0).
function isHostableDay(dateStr) {
  if (!dateStr) return false;
  const [y, m, d] = dateStr.split("-").map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return day === 0 || day === 5 || day === 6;
}

// ------------------------------------------------------------
// SPACES
// ------------------------------------------------------------

app.get("/api/spaces", asyncRoute(async (req, res) => {
  const includeInactive = req.query.includeInactive === "true";
  const filter = includeInactive ? {} : { active: { $ne: false } };
  const spaces = await Space.find(filter);
  res.json(spaces.map((s) => s.toJSON()));
}));

app.post("/api/spaces", requireAdmin, asyncRoute(async (req, res) => {
  const { name, capacity, description, pricePerGuest } = req.body;
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: "Space name is required." });
  }
  const space = await Space.create({
    _id: "space_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: String(name).trim(),
    capacity: Number(capacity) || 1,
    description: (description || "").trim(),
    pricePerGuest: Number(pricePerGuest) || 0,
    active: true
  });
  res.status(201).json(space.toJSON());
}));
app.patch("/api/spaces/:id", requireAdmin, asyncRoute(async (req, res) => {
  const space = await Space.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });
  if (!space) return res.status(404).json({ error: "Space not found." });
  res.json(space.toJSON());
}));

app.delete("/api/spaces/:id", requireAdmin, asyncRoute(async (req, res) => {
  await Space.findByIdAndDelete(req.params.id);
  await Block.deleteMany({ spaceId: req.params.id });
  res.status(204).end();
}));

// ------------------------------------------------------------
// BOOKINGS
// ------------------------------------------------------------

app.get("/api/bookings", asyncRoute(async (req, res) => {
  const bookings = await Booking.find().sort({ createdAt: -1 });
  res.json(bookings.map((b) => b.toJSON()));
}));

app.post("/api/bookings", asyncRoute(async (req, res) => {
  const { type, name, email, phone, guests, date, spaceId, notes, proofOfPaymentUrl } = req.body;

  if (!date) return res.status(400).json({ error: "A date is required." });
  if (!isHostableDay(date)) {
    return res.status(400).json({ error: "Maison S hosts Fridays, Saturdays & Sundays only." });
  }

  // Re-check availability server-side too — never trust the
  // client's earlier availability check alone, since another
  // guest could confirm/block the same slot in between.
  if (spaceId) {
    const blocked = await Block.exists({ spaceId, date });
    const confirmed = await Booking.exists({ spaceId, date, status: "confirmed" });
    if (blocked || confirmed) {
      return res.status(409).json({ error: "That space is no longer available on that date." });
    }
  }

  const booking = await Booking.create({
    type: type || "General Enquiry",
    name: (name || "").trim(),
    email: (email || "").trim(),
    phone: (phone || "").trim(),
    guests: Number(guests) || 1,
    date,
    spaceId: spaceId || null,
    notes: notes || "",
    proofOfPaymentUrl: proofOfPaymentUrl || "",
    status: "pending"
  });

  res.status(201).json(booking.toJSON());

  // Email the admin — don't let a mail failure break the booking response,
  // since the booking itself already succeeded and was saved.
  try {
    let spaceName = "Any space";
    if (spaceId) {
      const space = await Space.findById(spaceId);
      if (space) spaceName = space.name;
    }
    await sendBookingNotification(booking.toJSON(), spaceName);
  } catch (err) {
    console.error("Failed to send booking notification email:", err.message);
  }
}));
app.post("/api/bookings/:id/message", requireAdmin, asyncRoute(async (req, res) => {
  const { subject, message } = req.body;

  if (!subject || !message) {
    return res.status(400).json({ error: "Subject and message are required." });
  }

  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ error: "Booking not found." });

  if (!booking.email) {
    return res.status(400).json({ error: "This booking has no email address on file." });
  }

  await sendCustomerMessage(booking.toJSON(), subject, message);
  res.json({ ok: true });
}));
app.patch("/api/bookings/:id/status", requireAdmin, asyncRoute(async (req, res) => {
  const { status } = req.body;
  if (!["pending", "confirmed", "declined"].includes(status)) {
    return res.status(400).json({ error: "Invalid status." });
  }
  const booking = await Booking.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true, runValidators: true }
  );
  if (!booking) return res.status(404).json({ error: "Booking not found." });
  res.json(booking.toJSON());
}));

app.delete("/api/bookings/:id", requireAdmin, asyncRoute(async (req, res) => {
  await Booking.findByIdAndDelete(req.params.id);
  res.status(204).end();
}));

// ------------------------------------------------------------
// MANUAL AVAILABILITY BLOCKS
// ------------------------------------------------------------

app.get("/api/blocks", asyncRoute(async (req, res) => {
  const blocks = await Block.find();
  res.json(blocks.map((b) => b.toJSON()));
}));

app.post("/api/blocks", requireAdmin, asyncRoute(async (req, res) => {
  const { spaceId, date, reason } = req.body;
  if (!spaceId || !date) {
    return res.status(400).json({ error: "spaceId and date are required." });
  }

  const existing = await Block.findOne({ spaceId, date });
  if (existing) return res.json(existing.toJSON());

  const block = await Block.create({ spaceId, date, reason: reason || "Unavailable" });
  res.status(201).json(block.toJSON());
}));

app.delete("/api/blocks/:id", requireAdmin, asyncRoute(async (req, res) => {
  await Block.findByIdAndDelete(req.params.id);
  res.status(204).end();
}));

// ------------------------------------------------------------
// ADMIN AUTH
// ------------------------------------------------------------

app.post("/api/admin/login", asyncRoute(async (req, res) => {
  const { passcode } = req.body;
  if (passcode !== ADMIN_PASSCODE) {
    return res.status(401).json({ error: "Incorrect passcode." });
  }
  res.json({ token: signToken() });
}));

// ------------------------------------------------------------
// GALLERIES
// ------------------------------------------------------------

app.get("/api/galleries", asyncRoute(async (req, res) => {
  const galleries = await Gallery.find();
  const map = {};
  galleries.forEach((g) => { map[g._id] = g.images; });
  res.json(map);
}));

app.post("/api/galleries/:cardKey/upload", requireAdmin, upload.single("image"), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image file provided." });

  const result = await uploadToCloudinary(req.file.buffer);

  const gallery = await Gallery.findByIdAndUpdate(
    req.params.cardKey,
    { $push: { images: result.secure_url } },
    { upsert: true, new: true }
  );

  res.status(201).json(gallery.toJSON());
}));

app.delete("/api/galleries/:cardKey/image", requireAdmin, asyncRoute(async (req, res) => {
  const { imageUrl } = req.body;
  if (!imageUrl) return res.status(400).json({ error: "imageUrl is required." });

  const gallery = await Gallery.findByIdAndUpdate(
    req.params.cardKey,
    { $pull: { images: imageUrl } },
    { new: true }
  );

  res.json(gallery ? gallery.toJSON() : { id: req.params.cardKey, images: [] });
}));


// ------------------------------------------------------------
// SITE CONTENT
// ------------------------------------------------------------

app.get("/api/content", asyncRoute(async (req, res) => {
  const items = await Content.find();
  const map = {};
  items.forEach((i) => { map[i._id] = i.value; });
  res.json(map);
}));

app.patch("/api/content", requireAdmin, asyncRoute(async (req, res) => {
  const updates = req.body;
  const ops = Object.entries(updates).map(([key, value]) => ({
    updateOne: {
      filter: { _id: key },
      update: { $set: { value } },
      upsert: true
    }
  }));
  if (ops.length) await Content.bulkWrite(ops);
  res.json({ ok: true });
}));

// ------------------------------------------------------------
// AVAILABILITY
// A space is unavailable on a date if it's manually blocked,// or already has a CONFIRMED booking for that date. Pending
// requests don't occupy the date.
// ------------------------------------------------------------

app.get("/api/availability", asyncRoute(async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: "date query param is required." });

  const [spaces, blocks, confirmedBookings] = await Promise.all([
    Space.find({ active: { $ne: false } }),
    Block.find({ date }),
    Booking.find({ date, status: "confirmed" })
  ]);

  const blockedIds = new Set(blocks.map((b) => b.spaceId));
  const bookedIds = new Set(confirmedBookings.map((b) => b.spaceId));

  const result = spaces.map((space) => {
    const json = space.toJSON();
    const blocked = blockedIds.has(json.id);
    const booked = bookedIds.has(json.id);
    return {
      ...json,
      available: !blocked && !booked,
      reason: blocked ? "blocked" : booked ? "booked" : null
    };
  });

  res.json(result);
}));

// ------------------------------------------------------------
// Error handling + startup
// ------------------------------------------------------------

app.use((err, req, res, _next) => {
  console.error(err);
  if (err.code === 11000) {
    return res.status(409).json({ error: "That record already exists." });
  }
  res.status(500).json({ error: "Something went wrong on the server." });
});

async function start() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB:", MONGODB_URI);
  await seedIfEmpty();
  app.listen(PORT, () => {
    console.log(`Maison S API listening on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});