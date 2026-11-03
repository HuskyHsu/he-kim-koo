import Toybox.Activity;
import Toybox.Application.Properties;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.Position;
import Toybox.WatchUi;

//! "He-Kim-Koo (Firefly)" GPS Breadcrumb Art Navigation Data Field
//! Tailored for Garmin Venu 2 Plus (416x416 AMOLED)
//! Features: Bioluminescent theme, smooth angular interpolation, progress-based coloring, 20m milestone sparks, and viewport culling.
class RouteDataField extends WatchUi.DataField {

    // Viewport zoom scale: 1 meter = 1.2 pixels (radius covers ~173 meters)
    private const ZOOM_SCALE = 1.2f;

    // Off-course threshold in meters (Cross-Track Distance)
    private const OFF_COURSE_THRESHOLD_M = 35.0f;

    // Viewport culling distance squared threshold (220m^2 = 48400)
    private const CULL_DIST_SQ = 48400.0f;

    // Trail circular buffer capacity (80 points covers ~200m smooth stream, takes ~320 Bytes)
    private const TRAIL_CAPACITY = 80;

    // Flat integer route coordinates [lat0, lon0, lat1, lon1, ...] in microdegrees (1e-5 deg)
    private var mPoints as Array<Number> = [] as Array<Number>;
    private var mPointCount as Number = 0;

    // Real-time sensor & GPS state
    private var mHasGps as Boolean = false;
    private var mCurrLatMicro as Number = 0;
    private var mCurrLonMicro as Number = 0;
    private var mCosLat as Float = 1.0f;

    // Heading smoothing filter (prevents snapping during sharp turns or screen switches)
    private var mTargetHeading as Float = 0.0f;
    private var mRenderHeading as Float = 0.0f;

    // Progress index and off-course state
    private var mIsOffCourse as Boolean = false;
    private var mOffCourseDist as Number = 0;
    private var mProgressIdx as Number = 0;

    // Trail circular buffer for the smooth comet stream
    private var mTrailPoints as Array<Number> = new [TRAIL_CAPACITY * 2] as Array<Number>;
    private var mTrailCount as Number = 0;
    private var mTrailHead as Number = 0;
    private var mLastTrailLat as Number = 0;
    private var mLastTrailLon as Number = 0;

    // 20m milestone spark buffer (10 fixed-world points covering 200m, fading in place, takes ~40 Bytes)
    private const SPARK_CAPACITY = 10;
    private var mSparkPoints as Array<Number> = new [SPARK_CAPACITY * 2] as Array<Number>;
    private var mSparkCount as Number = 0;
    private var mSparkHead as Number = 0;
    private var mLastSparkLat as Number = 0;
    private var mLastSparkLon as Number = 0;

    function initialize() {
        DataField.initialize();
        reloadRoute();
    }

    //! Reloads and decodes the Polyline string from App Settings
    public function reloadRoute() as Void {
        try {
            var rawStr = Properties.getValue("routeString");
            if (rawStr != null && rawStr instanceof String) {
                mPoints = PolylineDecoder.decode(rawStr as String);
                mPointCount = mPoints.size() / 2;
                mProgressIdx = 0;
            } else {
                mPoints = [] as Array<Number>;
                mPointCount = 0;
            }
        } catch (e) {
            mPoints = [] as Array<Number>;
            mPointCount = 0;
        }

        // Reset trail history
        mTrailCount = 0;
        mTrailHead = 0;
        mLastTrailLat = 0;
        mLastTrailLon = 0;

        mSparkCount = 0;
        mSparkHead = 0;
        mLastSparkLat = 0;
        mLastSparkLon = 0;
    }

    //! Core computation: updates GPS coordinates, smooth heading, progress tracking, and Cross-Track Distance
    function compute(info as Activity.Info) as Void {
        // 1. Read heading (GPS bearing in motion, electronic 3-axis compass when stationary)
        if (info.currentHeading != null) {
            mTargetHeading = info.currentHeading.toFloat();
        }

        // 2. Angular exponential smoothing (handles [-PI, +PI] wrap-around)
        var diff = mTargetHeading - mRenderHeading;
        while (diff > Math.PI) {
            diff -= 2 * Math.PI;
        }
        while (diff < -Math.PI) {
            diff += 2 * Math.PI;
        }
        // Smooth approach (approaches target by ~40% per second)
        mRenderHeading += diff * 0.40f;

        // 3. Verify GPS readiness
        if (info.currentLocation == null) {
            mHasGps = false;
            mIsOffCourse = false;
            return;
        }

        mHasGps = true;
        var degrees = info.currentLocation.toDegrees();
        var latDeg = degrees[0].toDouble();
        var lonDeg = degrees[1].toDouble();

        // Convert to microdegrees (integer)
        mCurrLatMicro = (latDeg * 100000.0d).toNumber();
        mCurrLonMicro = (lonDeg * 100000.0d).toNumber();

        // Cosine of latitude for metric conversion of longitude
        var latRad = (latDeg * Math.PI / 180.0d).toFloat();
        mCosLat = Math.cos(latRad);

        // 4. Record smooth trail points (every >2.5m)
        var dLatFromLast = (mCurrLatMicro - mLastTrailLat) * 1.111329f;
        var dLonFromLast = (mCurrLonMicro - mLastTrailLon) * 1.113195f * mCosLat;
        if (dLatFromLast * dLatFromLast + dLonFromLast * dLonFromLast > 6.25f || mTrailCount == 0) {
            var writeIdx = mTrailHead * 2;
            mTrailPoints[writeIdx] = mCurrLatMicro;
            mTrailPoints[writeIdx + 1] = mCurrLonMicro;
            mTrailHead = (mTrailHead + 1) % TRAIL_CAPACITY;
            if (mTrailCount < TRAIL_CAPACITY) {
                mTrailCount++;
            }
            mLastTrailLat = mCurrLatMicro;
            mLastTrailLon = mCurrLonMicro;
        }

        // 5. Record 20-meter milestone sparks (dropped at fixed ground coordinates, fades out in place)
        var dSparkLat = (mCurrLatMicro - mLastSparkLat) * 1.111329f;
        var dSparkLon = (mCurrLonMicro - mLastSparkLon) * 1.113195f * mCosLat;
        if (dSparkLat * dSparkLat + dSparkLon * dSparkLon >= 400.0f || mSparkCount == 0) {
            var sparkWriteIdx = mSparkHead * 2;
            mSparkPoints[sparkWriteIdx] = mCurrLatMicro;
            mSparkPoints[sparkWriteIdx + 1] = mCurrLonMicro;
            mSparkHead = (mSparkHead + 1) % SPARK_CAPACITY;
            if (mSparkCount < SPARK_CAPACITY) {
                mSparkCount++;
            }
            mLastSparkLat = mCurrLatMicro;
            mLastSparkLon = mCurrLonMicro;
        }

        if (mPointCount < 2) {
            mIsOffCourse = false;
            return;
        }

        // 6. Progress-aware sliding search window [mProgressIdx - 2, mProgressIdx + 5]
        var winStart = mProgressIdx - 2;
        if (winStart < 0) {
            winStart = 0;
        }

        var winEnd = mProgressIdx + 5;
        if (winEnd >= mPointCount - 1) {
            winEnd = mPointCount - 2;
        }

        var localMinDist = 999999.0f;
        var localBestIdx = mProgressIdx;
        var localBestT = 0.0f;

        for (var i = winStart; i <= winEnd; i++) {
            var idxA = i * 2;
            var idxB = (i + 1) * 2;

            var ax = (mPoints[idxA + 1] - mCurrLonMicro) * 1.113195f * mCosLat;
            var ay = (mPoints[idxA] - mCurrLatMicro) * 1.111329f;

            var bx = (mPoints[idxB + 1] - mCurrLonMicro) * 1.113195f * mCosLat;
            var by = (mPoints[idxB] - mCurrLatMicro) * 1.111329f;

            var vx = bx - ax;
            var vy = by - ay;
            var segLenSq = vx * vx + vy * vy;

            var d = 0.0f;
            var t = 0.0f;
            if (segLenSq < 0.001f) {
                d = Math.sqrt(ax * ax + ay * ay);
            } else {
                t = (-ax * vx - ay * vy) / segLenSq;
                var tClamped = t;
                if (tClamped < 0.0f) {
                    tClamped = 0.0f;
                } else if (tClamped > 1.0f) {
                    tClamped = 1.0f;
                }
                var qx = ax + tClamped * vx;
                var qy = ay + tClamped * vy;
                d = Math.sqrt(qx * qx + qy * qy);
            }

            if (d < localMinDist) {
                localMinDist = d;
                localBestIdx = i;
                localBestT = t;
            }
        }

        var finalDist = localMinDist;

        // If runner is close to the expected segment (distance <= 40m)
        if (localMinDist <= 40.0f) {
            if (localBestIdx > mProgressIdx) {
                mProgressIdx = localBestIdx;
            } else if (localBestIdx == mProgressIdx && localBestT >= 0.8f && mProgressIdx < mPointCount - 2) {
                mProgressIdx = mProgressIdx + 1;
            }
            finalDist = localMinDist;
        } else {
            // If distance exceeds 40m, perform global search to detect shortcut or genuine off-course
            var globalMinDist = 999999.0f;
            var globalBestIdx = 0;
            for (var g = 0; g < mPointCount - 1; g++) {
                var gIdxA = g * 2;
                var gIdxB = (g + 1) * 2;
                var gax = (mPoints[gIdxA + 1] - mCurrLonMicro) * 1.113195f * mCosLat;
                var gay = (mPoints[gIdxA] - mCurrLatMicro) * 1.111329f;
                var gbx = (mPoints[gIdxB + 1] - mCurrLonMicro) * 1.113195f * mCosLat;
                var gby = (mPoints[gIdxB] - mCurrLatMicro) * 1.111329f;
                var gvx = gbx - gax;
                var gvy = gby - gay;
                var glenSq = gvx * gvx + gvy * gvy;
                var gd = 0.0f;
                if (glenSq < 0.001f) {
                    gd = Math.sqrt(gax * gax + gay * gay);
                } else {
                    var gt = (-gax * gvx - gay * gvy) / glenSq;
                    if (gt < 0.0f) { gt = 0.0f; } else if (gt > 1.0f) { gt = 1.0f; }
                    var gqx = gax + gt * gvx;
                    var gqy = gay + gt * gvy;
                    gd = Math.sqrt(gqx * gqx + gqy * gqy);
                }
                if (gd < globalMinDist) {
                    globalMinDist = gd;
                    globalBestIdx = g;
                }
            }

            // If a forward segment is found very close (<20m), advance progress
            if (globalMinDist < 20.0f && globalBestIdx > mProgressIdx) {
                mProgressIdx = globalBestIdx;
                finalDist = globalMinDist;
            } else {
                finalDist = localMinDist;
            }
        }

        // 7. Off-course alert evaluation
        if (finalDist > OFF_COURSE_THRESHOLD_M) {
            mIsOffCourse = true;
            mOffCourseDist = finalDist.toNumber();
        } else {
            mIsOffCourse = false;
            mOffCourseDist = 0;
        }
    }

    //! Rendering: Firefly bioluminescent aesthetics, smooth heading-up projection, and route coloring
    function onUpdate(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var cx = w / 2;
        var cy = h / 2;

        // 1. Pure black background (AMOLED deep night black)
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();

        // 2. Status message: No route or waiting for GPS
        if (mPointCount < 2) {
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, cy - 24, Graphics.FONT_MEDIUM, "NO ROUTE", Graphics.TEXT_JUSTIFY_CENTER);
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, cy + 12, Graphics.FONT_XTINY, "PASTE IN APP SETTINGS", Graphics.TEXT_JUSTIFY_CENTER);
            return;
        }

        if (!mHasGps) {
            dc.setColor(Graphics.COLOR_YELLOW, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, cy - 10, Graphics.FONT_SMALL, "WAITING FOR GPS", Graphics.TEXT_JUSTIFY_CENTER);
            return;
        }

        // 3. 2D rotation matrix: Heading-Up projection
        var heading = mRenderHeading;
        var sinH = Math.sin(heading);
        var cosH = Math.cos(heading);

        // 4. Render route geometry (distinguishing completed vs upcoming path)
        for (var i = 0; i < mPointCount - 1; i++) {
            var idxA = i * 2;
            var idxB = (i + 1) * 2;

            var ax = (mPoints[idxA + 1] - mCurrLonMicro) * 1.113195f * mCosLat;
            var ay = (mPoints[idxA] - mCurrLatMicro) * 1.111329f;

            var bx = (mPoints[idxB + 1] - mCurrLonMicro) * 1.113195f * mCosLat;
            var by = (mPoints[idxB] - mCurrLatMicro) * 1.111329f;

            // Viewport culling: skip if both endpoints are outside view radius (~220m)
            var distSqA = ax * ax + ay * ay;
            var distSqB = bx * bx + by * by;
            if (distSqA > CULL_DIST_SQ && distSqB > CULL_DIST_SQ) {
                continue;
            }

            // Heading-up 2D projection
            var sx1 = cx + (ax * cosH - ay * sinH) * ZOOM_SCALE;
            var sy1 = cy - (ay * cosH + ax * sinH) * ZOOM_SCALE;
            var sx2 = cx + (bx * cosH - by * sinH) * ZOOM_SCALE;
            var sy2 = cy - (by * cosH + bx * sinH) * ZOOM_SCALE;

            // Route color scheme (Plan A: Summer Night Bioluminescence, 4px width):
            // Upcoming route (i >= mProgressIdx): Electric Cyan (COLOR_BLUE)
            // Completed route (i < mProgressIdx): Warm Golden Amber (COLOR_ORANGE)
            if (i < mProgressIdx) {
                dc.setColor(Graphics.COLOR_ORANGE, Graphics.COLOR_TRANSPARENT);
                dc.setPenWidth(4);
            } else {
                dc.setColor(Graphics.COLOR_BLUE, Graphics.COLOR_TRANSPARENT);
                dc.setPenWidth(4);
            }

            dc.drawLine(sx1.toNumber(), sy1.toNumber(), sx2.toNumber(), sy2.toNumber());

            // Node dots for completed route
            if (i < mProgressIdx) {
                dc.setColor(Graphics.COLOR_ORANGE, Graphics.COLOR_ORANGE);
                dc.fillCircle(sx1.toNumber(), sy1.toNumber(), 2);
            }
        }

        // 5. Render smooth firefly comet tail (bioluminescent green)
        if (mTrailCount > 1) {
            var startIdx = (mTrailHead - mTrailCount + TRAIL_CAPACITY) % TRAIL_CAPACITY;
            var numSegs = mTrailCount - 1;

            for (var t = 0; t < numSegs; t++) {
                var p1Idx = ((startIdx + t) % TRAIL_CAPACITY) * 2;
                var p2Idx = ((startIdx + t + 1) % TRAIL_CAPACITY) * 2;

                var tax1 = (mTrailPoints[p1Idx + 1] - mCurrLonMicro) * 1.113195f * mCosLat;
                var tay1 = (mTrailPoints[p1Idx] - mCurrLatMicro) * 1.111329f;
                var tax2 = (mTrailPoints[p2Idx + 1] - mCurrLonMicro) * 1.113195f * mCosLat;
                var tay2 = (mTrailPoints[p2Idx] - mCurrLatMicro) * 1.111329f;

                if (tax1 * tax1 + tay1 * tay1 <= CULL_DIST_SQ) {
                    var tsx1 = cx + (tax1 * cosH - tay1 * sinH) * ZOOM_SCALE;
                    var tsy1 = cy - (tay1 * cosH + tax1 * sinH) * ZOOM_SCALE;
                    var tsx2 = cx + (tax2 * cosH - tay2 * sinH) * ZOOM_SCALE;
                    var tsy2 = cy - (tay2 * cosH + tax2 * sinH) * ZOOM_SCALE;

                    var ratio = t.toFloat() / numSegs.toFloat();
                    if (ratio < 0.35f) {
                        dc.setColor(Graphics.COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
                        dc.setPenWidth(2);
                    } else if (ratio < 0.70f) {
                        dc.setColor(Graphics.COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
                        dc.setPenWidth(3);
                    } else {
                        dc.setColor(Graphics.COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
                        dc.setPenWidth(5);
                    }

                    dc.drawLine(tsx1.toNumber(), tsy1.toNumber(), tsx2.toNumber(), tsy2.toNumber());
                }
            }
        }

        // 6. Render 20m milestone firefly sparks (10 dots covering 200m, fixed in world coordinates, fading in place)
        if (mSparkCount > 0) {
            var sparkStartIdx = (mSparkHead - mSparkCount + SPARK_CAPACITY) % SPARK_CAPACITY;
            for (var s = 0; s < mSparkCount; s++) {
                var spIdx = ((sparkStartIdx + s) % SPARK_CAPACITY) * 2;
                var sax = (mSparkPoints[spIdx + 1] - mCurrLonMicro) * 1.113195f * mCosLat;
                var say = (mSparkPoints[spIdx] - mCurrLatMicro) * 1.111329f;

                if (sax * sax + say * say <= CULL_DIST_SQ) {
                    var ssx = cx + (sax * cosH - say * sinH) * ZOOM_SCALE;
                    var ssy = cy - (say * cosH + sax * sinH) * ZOOM_SCALE;

                    var sparkRatio = (s + 1).toFloat() / mSparkCount.toFloat(); // 0 (oldest) -> 1 (newest)

                    if (sparkRatio < 0.35f) {
                        // Distant dot: faint dark green dot (fading out)
                        dc.setColor(Graphics.COLOR_DK_GREEN, Graphics.COLOR_DK_GREEN);
                        dc.fillCircle(ssx.toNumber(), ssy.toNumber(), 2);
                    } else if (sparkRatio < 0.70f) {
                        // Mid-range: lime green spark
                        dc.setColor(Graphics.COLOR_GREEN, Graphics.COLOR_GREEN);
                        dc.fillCircle(ssx.toNumber(), ssy.toNumber(), 2);
                    } else {
                        // Near runner: dual-layer ember (green halo + bright white core)
                        dc.setColor(Graphics.COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
                        dc.drawCircle(ssx.toNumber(), ssy.toNumber(), 4);
                        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_WHITE);
                        dc.fillCircle(ssx.toNumber(), ssy.toNumber(), 2);
                    }
                }
            }
        }

        // 7. Render runner cursor: GPS Navigation Chevron in bioluminescent lime green
        
        // (1) Arrow body
        dc.setColor(Graphics.COLOR_GREEN, Graphics.COLOR_GREEN);
        var navDart = [
            [cx, cy - 13],
            [cx + 8, cy + 9],
            [cx, cy + 4],
            [cx - 8, cy + 9]
        ];
        dc.fillPolygon(navDart);

        // (2) Crisp white border outline
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(2);
        dc.drawLine(cx, cy - 13, cx + 8, cy + 9);
        dc.drawLine(cx + 8, cy + 9, cx, cy + 4);
        dc.drawLine(cx, cy + 4, cx - 8, cy + 9);
        dc.drawLine(cx - 8, cy + 9, cx, cy - 13);

        // (3) Center guidance dot
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_WHITE);
        dc.fillCircle(cx, cy - 1, 2);

        // 8. Off-course alert banner
        if (mIsOffCourse) {
            var bannerW = 220;
            var bannerH = 34;
            var bannerX = cx - (bannerW / 2);
            var bannerY = 24;

            dc.setColor(Graphics.COLOR_RED, Graphics.COLOR_RED);
            dc.fillRoundedRectangle(bannerX, bannerY, bannerW, bannerH, 6);

            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            var alertText = "OFF COURSE (+" + mOffCourseDist + "m)";
            dc.drawText(cx, bannerY + 6, Graphics.FONT_XTINY, alertText, Graphics.TEXT_JUSTIFY_CENTER);
        }
    }
}
