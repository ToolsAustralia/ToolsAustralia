import { Schema, models, model } from "mongoose";

const normEndpointSettingsSchema = new Schema(
  {
    registryKey: { type: String, required: true, unique: true, index: true },
    disabled: { type: Boolean, default: false },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "normendpointsettings" }
);

normEndpointSettingsSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

const NormEndpointSettings =
  models.NormEndpointSettings || model("NormEndpointSettings", normEndpointSettingsSchema);
export default NormEndpointSettings;
