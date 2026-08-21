const mongoose = require("mongoose");

const blockSchema = new mongoose.Schema({
  spaceId: { type: String, required: true },
  date: { type: String, required: true }, // "YYYY-MM-DD"
  reason: { type: String, default: "Unavailable" }
});

// A space can only be blocked once per date — enforced at the
// DB level as well as in the route handler.
blockSchema.index({ spaceId: 1, date: 1 }, { unique: true });

blockSchema.set("toJSON", {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model("Block", blockSchema);