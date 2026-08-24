const mongoose = require("mongoose");

const gallerySchema = new mongoose.Schema({
  _id: { type: String, required: true }, // e.g. "house.patio"
  images: { type: [String], default: [] } // array of Cloudinary URLs
});

gallerySchema.set("toJSON", {
  transform: (_doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model("Gallery", gallerySchema);