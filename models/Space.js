const mongoose = require("mongoose");

/**
 * Spaces use a plain STRING _id instead of Mongo's default
 * ObjectId. This is deliberate: index.html has three space IDs
 * ("space_patio", "space_dining", "space_fullhouse") hardcoded
 * into its "Book Now" buttons. Seeding those exact strings as
 * the _id here means the existing frontend keeps working with
 * zero edits. New spaces added later (via the admin dashboard)
 * get a generated "space_<timestamp>" id in the same style.
 */
const spaceSchema = new mongoose.Schema({
  _id: { type: String },
  name: { type: String, required: true },
  capacity: { type: Number, default: 1 },
  description: { type: String, default: "" },
  active: { type: Boolean, default: true }
});

spaceSchema.set("toJSON", {
  transform: (_doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model("Space", spaceSchema);