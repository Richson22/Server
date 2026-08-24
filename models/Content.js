const mongoose = require("mongoose");

const contentSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // e.g. "hero.lede" or "house.patio.gallery"
  value: { type: mongoose.Schema.Types.Mixed, required: true, default: "" }
}, { _id: false });

contentSchema.set("toJSON", {
  transform: (_doc, ret) => {
    ret.key = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model("Content", contentSchema);