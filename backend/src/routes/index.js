// src/routes/index.js
import express from "express";

// Import route modules
import authRoutes from "./auth.routes.js";
// import restaurantRoutes from "./restaurant.routes.js";
// import tableRoutes from "./table.routes.js";
import menuRoutes from "./menu.routes.js";
// import orderRoutes from "./order.routes.js";
// import paymentRoutes from "./payment.routes.js";
// import cashierRoutes from "./cashier.routes.js";
// import kitchenRoutes from "./kitchen.routes.js";
// import superadminRoutes from "./superadmin.routes.js";

const router = express.Router();

// ============================================
// TEST ROUTE (Remove in production)
// ============================================

router.get("/test", (req, res) => {
  res.json({
    status: "success",
    message: "API is working!",
    timestamp: new Date().toISOString()
  });
});

// ============================================
// MOUNT ROUTES
// ============================================

// Authentication routes - /api/auth/*
router.use("/auth", authRoutes);

// Restaurant routes - /api/restaurant/*
// router.use("/restaurant", restaurantRoutes);

// Table management routes - /api/tables/*
// router.use("/tables", tableRoutes);

// Menu routes - /api/menu/*
router.use("/menu", menuRoutes);

// Order routes - /api/orders/*
// router.use("/orders", orderRoutes);

// Payment routes - /api/payments/*
// router.use("/payments", paymentRoutes);

// Cashier routes - /api/cashier/*
// router.use("/cashier", cashierRoutes);

// Kitchen routes - /api/kitchen/*
// router.use("/kitchen", kitchenRoutes);

// Superadmin routes - /api/superadmin/*
// router.use("/superadmin", superadminRoutes);

export default router;