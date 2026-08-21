const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({
  type: { type: String, default: "General Enquiry" },
  name: { type: String, default: "" },
  email: { type: String, default: "" },
  phone: { type: String, default: "" },
  guests: { type: Number, default: 1 },
  date: { type: String, required: true }, // "YYYY-MM-DD"
  spaceId: { type: String, default: null },
  status: {
    type: String,
    enum: ["pending", "confirmed", "declined"],
    default: "pending"
  },
  notes: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now }
});

bookingSchema.set("toJSON", {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model("Booking", bookingSchema);