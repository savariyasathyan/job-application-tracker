
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

const STATUSES = [
  "Applied",
  "Interview",
  "Offer",
  "Accepted",
  "Rejected",
  "Declined"
];

const FINAL_STATUSES = ["Accepted", "Rejected", "Declined"];

const TRANSITIONS = {
  Applied: ["Interview", "Rejected"],
  Interview: ["Offer", "Rejected"],
  Offer: ["Accepted", "Declined"],
  Accepted: [],
  Rejected: [],
  Declined: []
};

// Counter used to generate a separate sequence for each company.
const counterSchema = new mongoose.Schema({
  _id: String,
  sequence: { type: Number, default: 0 }
});

const Counter = mongoose.model("Counter", counterSchema);

const applicationSchema = new mongoose.Schema({
  applicationId: { type: String, unique: true, required: true },
  companyName: { type: String, required: true, trim: true },
  companyKey: { type: String, required: true },
  jobRole: { type: String, required: true, trim: true },
  jobType: {
    type: String,
    enum: ["Full-time", "Internship", "Contract"],
    required: true
  },
  appliedDate: { type: Date, required: true },
  expectedSalary: { type: Number, min: 0, default: null },
  notes: { type: String, default: "" },
  status: {
    type: String,
    enum: STATUSES,
    default: "Applied"
  },
  followUpDate: { type: Date, required: true },
  statusHistory: [{
    status: { type: String, enum: STATUSES },
    date: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

applicationSchema.index({ companyKey: 1, jobRole: 1, status: 1 });

const Application = mongoose.model("Application", applicationSchema);

function response(res, statusCode, success, message, data = null) {
  return res.status(statusCode).json({
    success,
    message,
    data
  });
}

function makeCompanyKey(company) {
  return company.trim().toLowerCase();
}

function makeApplicationPrefix(company) {
  const letters = company.toUpperCase().replace(/[^A-Z]/g, "");
  return (letters + "XXX").slice(0, 3);
}

function validAppliedDate(value) {
  if (!value) return false;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const today = new Date();
  today.setHours(23, 59, 59, 999);

  return date <= today;
}

function addSevenDays(date) {
  const result = new Date(date);
  result.setDate(result.getDate() + 7);
  return result;
}

function decorate(application) {
  const item = application.toObject();
  item.isOverdue =
    item.status === "Applied" &&
    new Date() > new Date(item.followUpDate);

  item.allowedNextStatuses = TRANSITIONS[item.status] || [];
  item.canDelete =
    item.status === "Applied" ||
    FINAL_STATUSES.includes(item.status);

  return item;
}

app.get("/api/health", (req, res) => {
  response(res, 200, true, "Job Application Tracker API is running");
});

// Get applications, status counts, search and filter.
app.get("/api/applications", async (req, res) => {
  try {
    const filter = {};

    if (req.query.status) {
      if (!STATUSES.includes(req.query.status)) {
        return response(res, 400, false, "Invalid status filter");
      }
      filter.status = req.query.status;
    }

    if (req.query.company) {
      filter.companyName = {
        $regex: req.query.company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        $options: "i"
      };
    }

    const applications = await Application.find(filter).sort({
      createdAt: -1
    });

    const counts = await Application.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);

    const statusCounts = Object.fromEntries(
      STATUSES.map(status => [status, 0])
    );

    counts.forEach(item => {
      statusCounts[item._id] = item.count;
    });

    response(res, 200, true, "Applications retrieved successfully", {
      applications: applications.map(decorate),
      statusCounts
    });
  } catch (error) {
    response(res, 500, false, error.message);
  }
});

// Get one application and its status timeline.
app.get("/api/applications/:id", async (req, res) => {
  try {
    const item = await Application.findById(req.params.id);

    if (!item) {
      return response(res, 404, false, "Application not found");
    }

    response(res, 200, true, "Application retrieved successfully", decorate(item));
  } catch (error) {
    response(res, 400, false, "Invalid application ID");
  }
});

// Add an application. The client cannot choose its ID or initial status.
app.post("/api/applications", async (req, res) => {
  try {
    const {
      companyName, jobRole, jobType, appliedDate,
      expectedSalary, notes
    } = req.body;

    if (!companyName?.trim() || !jobRole?.trim() || !jobType || !appliedDate) {
      return response(res, 400, false, "Company, role, job type and applied date are required");
    }

    if (!["Full-time", "Internship", "Contract"].includes(jobType)) {
      return response(res, 400, false, "Invalid job type");
    }

    if (!validAppliedDate(appliedDate)) {
      return response(res, 400, false, "Applied date cannot be in the future or invalid");
    }

    if (
      expectedSalary !== undefined &&
      expectedSalary !== null &&
      expectedSalary !== "" &&
      (!Number.isFinite(Number(expectedSalary)) || Number(expectedSalary) < 0)
    ) {
      return response(res, 400, false, "Expected salary must be a non-negative number");
    }

    const companyKey = makeCompanyKey(companyName);
    const duplicate = await Application.findOne({
      companyKey,
      jobRole: { $regex: "^" + jobRole.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", $options: "i" },
      status: { $nin: FINAL_STATUSES }
    });

    if (duplicate) {
      return response(res, 409, false, "An active application for this company and role already exists");
    }

    const prefix = makeApplicationPrefix(companyName);
    const counter = await Counter.findOneAndUpdate(
      { _id: companyKey },
      { $inc: { sequence: 1 } },
      { new: true, upsert: true }
    );

    const applicationId =
      `JA-${prefix}-${String(counter.sequence).padStart(3, "0")}`;

    const applied = new Date(appliedDate);

    const application = await Application.create({
      applicationId,
      companyName: companyName.trim(),
      companyKey,
      jobRole: jobRole.trim(),
      jobType,
      appliedDate: applied,
      expectedSalary:
        expectedSalary === "" || expectedSalary == null
          ? null
          : Number(expectedSalary),
      notes: notes || "",
      status: "Applied",
      followUpDate: addSevenDays(applied),
      statusHistory: [{ status: "Applied", date: new Date() }]
    });

    response(res, 201, true, "Application created successfully", decorate(application));
  } catch (error) {
    response(res, 400, false, error.message);
  }
});

// Edit permitted fields only.
app.put("/api/applications/:id", async (req, res) => {
  try {
    const application = await Application.findById(req.params.id);

    if (!application) {
      return response(res, 404, false, "Application not found");
    }

    const { companyName, jobRole, jobType, expectedSalary, notes } = req.body;

    if (companyName !== undefined || jobRole !== undefined) {
      const newCompany = (companyName ?? application.companyName).trim();
      const newRole = (jobRole ?? application.jobRole).trim();

      if (!newCompany || !newRole) {
        return response(res, 400, false, "Company name and job role cannot be empty");
      }

      const companyKey = makeCompanyKey(newCompany);

      const duplicate = await Application.findOne({
        _id: { $ne: application._id },
        companyKey,
        jobRole: {
          $regex: "^" + newRole.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$",
          $options: "i"
        },
        status: { $nin: FINAL_STATUSES }
      });

      if (duplicate && !FINAL_STATUSES.includes(application.status)) {
        return response(res, 409, false, "An active application for this company and role already exists");
      }

      application.companyName = newCompany;
      application.companyKey = companyKey;
      application.jobRole = newRole;
    }

    if (jobType !== undefined) {
      if (!["Full-time", "Internship", "Contract"].includes(jobType)) {
        return response(res, 400, false, "Invalid job type");
      }
      application.jobType = jobType;
    }

    if (expectedSalary !== undefined) {
      if (
        expectedSalary !== null &&
        expectedSalary !== "" &&
        (!Number.isFinite(Number(expectedSalary)) || Number(expectedSalary) < 0)
      ) {
        return response(res, 400, false, "Expected salary must be a non-negative number");
      }

      application.expectedSalary =
        expectedSalary === "" || expectedSalary === null
          ? null
          : Number(expectedSalary);
    }

    if (notes !== undefined) application.notes = notes;

    // applicationId, appliedDate, status and followUpDate cannot be edited here.
    await application.save();

    response(res, 200, true, "Application updated successfully", decorate(application));
  } catch (error) {
    response(res, 400, false, error.message);
  }
});

// Change status using the allowed workflow.
app.patch("/api/applications/:id/status", async (req, res) => {
  try {
    const { status } = req.body;

    if (!STATUSES.includes(status)) {
      return response(res, 400, false, "Invalid status");
    }

    const application = await Application.findById(req.params.id);

    if (!application) {
      return response(res, 404, false, "Application not found");
    }

    if (!TRANSITIONS[application.status].includes(status)) {
      return response(
        res,
        400,
        false,
        `Cannot change status from ${application.status} to ${status}`
      );
    }

    application.status = status;
    application.statusHistory.push({ status, date: new Date() });

    await application.save();

    response(res, 200, true, "Status updated successfully", decorate(application));
  } catch (error) {
    response(res, 400, false, error.message);
  }
});

// Delete only Applied or final-status applications.
app.delete("/api/applications/:id", async (req, res) => {
  try {
    const application = await Application.findById(req.params.id);

    if (!application) {
      return response(res, 404, false, "Application not found");
    }

    if (
      application.status !== "Applied" &&
      !FINAL_STATUSES.includes(application.status)
    ) {
      return response(
        res,
        400,
        false,
        "Applications in Interview or Offer status cannot be deleted"
      );
    }

    await application.deleteOne();

    response(res, 200, true, "Application deleted successfully");
  } catch (error) {
    response(res, 400, false, "Invalid application ID");
  }
});

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("Connected to MongoDB Atlas");
    app.listen(PORT, () => {
      console.log(`Backend running at http://localhost:${PORT}`);
    });
  })
  .catch(error => {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  });

  
