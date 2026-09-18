import { Express, Request, Response } from "express";
import { z } from "zod";
import { storage } from "../../storage";
import { ensureSuperAdmin } from "../../middleware";
import { catalogFingerprint } from "../../services/stripe-catalog-domain";
import { createStripeCatalogSyncService } from "./stripe-catalog-routes";


const createCouponSchema = z.object({
  code: z.string().min(1, "Coupon code is required").max(50, "Coupon code too long"),
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  description: z.string().optional(),
  discountType: z.enum(['percentage', 'fixed_amount']),
  discountValue: z.number().positive("Discount value must be positive"),
  usageLimit: z.number().int().positive().optional().nullable(),
  usageLimitPerUser: z.number().int().positive().default(1),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional().nullable(),
  applicablePlanIds: z.array(z.number().int()).optional().nullable(),
  minimumPlanValue: z.number().positive().optional().nullable(),
  isActive: z.boolean().default(true)
});

const updateCouponSchema = createCouponSchema.partial().extend({
  id: z.number().int().positive()
});

const validateCouponSchema = z.object({
  code: z.string().min(1, "Coupon code is required"),
  planId: z.number().int().positive("Plan ID is required"),
  amount: z.number().positive("Amount must be positive")
});

type CouponRouteDependencies = {
  storage: Pick<typeof storage, 'getAllCoupons' | 'createCoupon' | 'updateCoupon' | 'getCouponById' | 'getCouponByCode' | 'deleteCoupon' | 'enqueueStripeCatalogSync' | 'validateCoupon' | 'getCouponUsageStats'>;
  archiveCoupon: (couponId: number) => Promise<unknown>;
};

function couponSyncFingerprint(coupon: Record<string, unknown>) {
  const { stripeCouponId, stripePromotionCodeId, stripeSyncStatus, stripeSyncError, stripeSyncedAt, stripeSyncFingerprint, ...catalog } = coupon;
  return catalogFingerprint(catalog);
}

export function setupCouponRoutes(app: Express, dependencies: Partial<CouponRouteDependencies> = {}) {
  const routeStorage = dependencies.storage ?? storage;
  const archiveCoupon = dependencies.archiveCoupon ?? (async (couponId: number) => (await createStripeCatalogSyncService()).archiveCoupon(couponId));
  

  app.get("/api/admin/coupons", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const coupons = await routeStorage.getAllCoupons();
      res.json(coupons);
    } catch (error: any) {
      console.error("Error fetching coupons:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch coupons"
      });
    }
  });


  app.post("/api/admin/coupons", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const validatedData = createCouponSchema.parse(req.body);
      

      const existingCoupon = await routeStorage.getCouponByCode(validatedData.code);
      if (existingCoupon) {
        return res.status(400).json({
          success: false,
          message: "Coupon code already exists"
        });
      }


      if (validatedData.discountType === 'percentage' && validatedData.discountValue > 100) {
        return res.status(400).json({
          success: false,
          message: "Percentage discount cannot exceed 100%"
        });
      }

      const couponData = {
        ...validatedData,
        createdBy: (req as any).user!.id,
        companyId: null // Global coupons for now
      };

      const coupon = await routeStorage.createCoupon(couponData);
      const pendingCoupon = await routeStorage.updateCoupon(coupon.id, { stripeSyncStatus: 'pending', stripeSyncError: null });
      await routeStorage.enqueueStripeCatalogSync({ entityType: 'coupon', entityId: pendingCoupon.id, operation: 'upsert', fingerprint: couponSyncFingerprint(pendingCoupon) });
      res.status(201).json({
        success: true,
        data: pendingCoupon
      });

    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: "Invalid input data",
          errors: error.errors
        });
      }

      console.error("Error creating coupon:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to create coupon"
      });
    }
  });


  app.put("/api/admin/coupons/:id", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const couponId = parseInt(req.params.id);
      if (isNaN(couponId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid coupon ID"
        });
      }

      const validatedData = updateCouponSchema.parse({ ...req.body, id: couponId });


      const existingCoupon = await routeStorage.getCouponById(couponId);
      if (!existingCoupon) {
        return res.status(404).json({
          success: false,
          message: "Coupon not found"
        });
      }


      if (validatedData.code && validatedData.code !== existingCoupon.code) {
        const codeExists = await routeStorage.getCouponByCode(validatedData.code);
        if (codeExists) {
          return res.status(400).json({
            success: false,
            message: "Coupon code already exists"
          });
        }
      }


      if (validatedData.discountType === 'percentage' && validatedData.discountValue && validatedData.discountValue > 100) {
        return res.status(400).json({
          success: false,
          message: "Percentage discount cannot exceed 100%"
        });
      }

      const updatedCoupon = await routeStorage.updateCoupon(couponId, validatedData);
      const pendingCoupon = await routeStorage.updateCoupon(updatedCoupon.id, { stripeSyncStatus: 'pending', stripeSyncError: null });
      await routeStorage.enqueueStripeCatalogSync({ entityType: 'coupon', entityId: pendingCoupon.id, operation: 'upsert', fingerprint: couponSyncFingerprint(pendingCoupon) });
      res.json({
        success: true,
        data: pendingCoupon
      });

    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: "Invalid input data",
          errors: error.errors
        });
      }

      console.error("Error updating coupon:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to update coupon"
      });
    }
  });


  app.delete("/api/admin/coupons/:id", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const couponId = parseInt(req.params.id);
      if (isNaN(couponId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid coupon ID"
        });
      }

      try {
        await archiveCoupon(couponId);
      } catch (error) {
        return res.status(502).json({
          success: false,
          message: "Failed to archive coupon in Stripe"
        });
      }

      const deleted = await routeStorage.deleteCoupon(couponId);
      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: "Coupon not found"
        });
      }

      res.json({
        success: true,
        message: "Coupon deleted successfully"
      });

    } catch (error: any) {
      console.error("Error deleting coupon:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to delete coupon"
      });
    }
  });


  app.post("/api/coupons/validate", async (req: Request, res: Response) => {
    try {
      const validatedData = validateCouponSchema.parse(req.body);
      
      const validation = await routeStorage.validateCoupon(
        validatedData.code,
        validatedData.planId,
        validatedData.amount,
        req.user ? (req.user as any).id : null
      );

      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          message: validation.reason
        });
      }

      res.json({
        success: true,
        data: {
          couponId: validation.coupon.id,
          discountAmount: validation.discountAmount,
          finalAmount: validation.finalAmount,
          discountType: validation.coupon.discountType,
          discountValue: validation.coupon.discountValue
        }
      });

    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: "Invalid input data",
          errors: error.errors
        });
      }

      console.error("Error validating coupon:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to validate coupon"
      });
    }
  });


  app.get("/api/admin/coupons/:id/usage", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const couponId = parseInt(req.params.id);
      if (isNaN(couponId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid coupon ID"
        });
      }

      const usage = await routeStorage.getCouponUsageStats(couponId);
      res.json({
        success: true,
        data: usage
      });

    } catch (error: any) {
      console.error("Error fetching coupon usage:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch coupon usage"
      });
    }
  });
}
