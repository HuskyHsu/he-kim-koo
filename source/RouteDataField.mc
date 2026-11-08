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

    // Configurable map view range & dynamic zoom
    private var mMapRange as Float = 175.0f;
    private var mCullDistSq as Float = 48400.0f;

    // Off-course threshold in meters (Cross-Track Distance)
    private const OFF_COURSE_THRESHOLD_M = 35.0f;

    // Bioluminescent AMOLED Theme Colors (Exact 1:1 match with index.html design)
    private const COLOR_CYAN = 0x00E5FF;       // Electric Cyan (#00e5ff) - Full route blueprint
    private const COLOR_LIME = 0xA3E635;       // Bioluminescent Lime Green (#a3e635) - Runner chevron & sparks
    private const COLOR_LIME_MID = 0x84CC16;   // Mid-range lime (#84cc16)
    private const COLOR_LIME_FAINT = 0x4D7C0F; // Fading wake green (#4d7c0f)
    private const COLOR_ALERT = 0xDC2626;      // Off-course red alert (#dc2626)
    private const COLOR_WHITE = 0xFFFFFF;      // Crisp pure white (#ffffff)
    private const COLOR_BLACK = 0x000000;      // AMOLED deep black (#000000)

    // Trail circular buffer capacity (80 points covers ~200m smooth stream, takes ~320 Bytes)
    private const TRAIL_CAPACITY = 80;

    // Flat integer route coordinates [lat0, lon0, lat1, lon1, ...] in microdegrees (1e-5 deg)
    private var mPoints as Array<Number> = [] as Array<Number>;
    private var mPointCount as Number = 0;

    // Directional chevron markers (50m intervals, 250m multiples are large & prominent)
    // Flat array: [lat0, lon0, ux10k0, uy10k0, ...]
    private var mChevrons as Array<Number> = [] as Array<Number>;
    private var mChevronCount as Number = 0;
    private var mShowDirection as Boolean = true;

    // Real-time sensor & GPS state
    private var mHasGps as Boolean = false;
    private var mHasEverHadGps as Boolean = false;
    private var mCurrLatMicro as Number = 0;
    private var mCurrLonMicro as Number = 0;
    private var mCosLat as Float = 1.0f;
    private var mGpsLostCount as Number = 0;

    // Route bounding box for full route thumbnail
    private var mMinLat as Number = 0;
    private var mMaxLat as Number = 0;
    private var mMinLon as Number = 0;
    private var mMaxLon as Number = 0;
    private var mCenterLat as Number = 0;
    private var mCenterLon as Number = 0;
    private var mRouteCosLat as Float = 1.0f;

    // Heading smoothing filter (prevents snapping during sharp turns or screen switches)
    private var mTargetHeading as Float = 0.0f;
    private var mRenderHeading as Float = 0.0f;

    // Off-course state
    private var mIsOffCourse as Boolean = false;
    private var mOffCourseDist as Number = 0;

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
            } else {
                mPoints = [] as Array<Number>;
                mPointCount = 0;
            }
        } catch (e) {
            mPoints = [] as Array<Number>;
            mPointCount = 0;
        }

        // Check route direction (0: Forward, 1: Reverse)
        try {
            var dirVal = Properties.getValue("routeDirection");
            if (dirVal != null && dirVal == 1 && mPointCount >= 2) {
                var left = 0;
                var right = (mPointCount - 1) * 2;
                while (left < right) {
                    var tempLat = mPoints[left];
                    var tempLon = mPoints[left + 1];
                    mPoints[left] = mPoints[right];
                    mPoints[left + 1] = mPoints[right + 1];
                    mPoints[right] = tempLat;
                    mPoints[right + 1] = tempLon;
                    left += 2;
                    right -= 2;
                }
            }
        } catch (e) {
        }

        // 2. Load configurable map view range (meters from center of screen)
        try {
            var rangeVal = Properties.getValue("mapRange");
            if (rangeVal != null && rangeVal instanceof Number && rangeVal >= 30) {
                mMapRange = rangeVal.toFloat();
            } else {
                mMapRange = 175.0f;
            }
        } catch (e) {
            mMapRange = 175.0f;
        }

        var cullDist = mMapRange * 1.30f;
        mCullDistSq = cullDist * cullDist;

        // 3. Load showDirection setting (whether to render directional chevrons)
        try {
            var showDirVal = Properties.getValue("showDirection");
            if (showDirVal != null && showDirVal instanceof Boolean) {
                mShowDirection = showDirVal;
            } else {
                mShowDirection = true;
            }
        } catch (e) {
            mShowDirection = true;
        }

        // Calculate route bounding box for thumbnail overview
        if (mPointCount >= 2) {
            var minLa = mPoints[0];
            var maxLa = mPoints[0];
            var minLo = mPoints[1];
            var maxLo = mPoints[1];

            for (var i = 1; i < mPointCount; i++) {
                var pLat = mPoints[i * 2];
                var pLon = mPoints[i * 2 + 1];
                if (pLat < minLa) { minLa = pLat; }
                if (pLat > maxLa) { maxLa = pLat; }
                if (pLon < minLo) { minLo = pLon; }
                if (pLon > maxLo) { maxLo = pLon; }
            }

            mMinLat = minLa;
            mMaxLat = maxLa;
            mMinLon = minLo;
            mMaxLon = maxLo;
            mCenterLat = (minLa + maxLa) / 2;
            mCenterLon = (minLo + maxLo) / 2;

            var centerLatRad = ((mCenterLat.toDouble() / 100000.0d) * Math.PI / 180.0d).toFloat();
            mRouteCosLat = Math.cos(centerLatRad);
        } else {
            mMinLat = 0;
            mMaxLat = 0;
            mMinLon = 0;
            mMaxLon = 0;
            mCenterLat = 0;
            mCenterLon = 0;
            mRouteCosLat = 1.0f;
        }

        // Precompute directional chevrons along cumulative route distance (50m intervals)
        if (mPointCount >= 2) {
            var totalMeters = 0.0f;
            for (var i = 0; i < mPointCount - 1; i++) {
                var p1Idx = i * 2;
                var p2Idx = (i + 1) * 2;
                var dx = (mPoints[p2Idx + 1] - mPoints[p1Idx + 1]) * 1.113195f * mRouteCosLat;
                var dy = (mPoints[p2Idx] - mPoints[p1Idx]) * 1.111329f;
                totalMeters += Math.sqrt(dx * dx + dy * dy);
            }

            var estChevrons = (totalMeters / 50.0f).toNumber();
            if (estChevrons > 500) {
                estChevrons = 500;
            }

            mChevrons = new [estChevrons * 4] as Array<Number>;
            mChevronCount = 0;

            var targetDist = 50.0f;
            var currentDist = 0.0f;

            for (var seg = 0; seg < mPointCount - 1; seg++) {
                if (mChevronCount >= estChevrons) {
                    break;
                }

                var i1 = seg * 2;
                var i2 = (seg + 1) * 2;

                var segLon1 = mPoints[i1 + 1];
                var segLat1 = mPoints[i1];
                var segLon2 = mPoints[i2 + 1];
                var segLat2 = mPoints[i2];

                var segDx = (segLon2 - segLon1) * 1.113195f * mRouteCosLat;
                var segDy = (segLat2 - segLat1) * 1.111329f;
                var segLen = Math.sqrt(segDx * segDx + segDy * segDy);

                if (segLen < 0.1f) {
                    continue;
                }

                var ux = segDx / segLen;
                var uy = segDy / segLen;
                var ux10k = (ux * 10000.0f).toNumber();
                var uy10k = (uy * 10000.0f).toNumber();

                while (targetDist <= currentDist + segLen && mChevronCount < estChevrons) {
                    var t = (targetDist - currentDist) / segLen;
                    var cLat = (segLat1 + t * (segLat2 - segLat1)).toNumber();
                    var cLon = (segLon1 + t * (segLon2 - segLon1)).toNumber();

                    var writeIdx = mChevronCount * 4;
                    mChevrons[writeIdx] = cLat;
                    mChevrons[writeIdx + 1] = cLon;
                    mChevrons[writeIdx + 2] = ux10k;
                    mChevrons[writeIdx + 3] = uy10k;

                    mChevronCount++;
                    targetDist += 50.0f;
                }

                currentDist += segLen;
            }
        } else {
            mChevrons = [] as Array<Number>;
            mChevronCount = 0;
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

        mGpsLostCount = 0;
        if (!mHasGps) {
            mHasEverHadGps = false;
        }
    }

    //! Core computation: updates GPS coordinates, smooth heading, progress tracking, and Cross-Track Distance
    function compute(info as Activity.Info) as Void {
        // 1. Read heading: Speed-aware dynamic heading selection
        // In motion (speed > 0.8 m/s ≈ 2.8 km/h), prioritize GPS ground track (info.track)
        // so that the heading-up view accurately reflects bodily direction of travel,
        // eliminating wrist-angle tilt (e.g. wearing watch on left wrist).
        // When stationary or standing still, fall back to hardware 3-axis electronic compass.
        var speed = info.currentSpeed;
        var hasTrack = (info has :track && info.track != null);

        if (hasTrack && (speed == null || speed > 0.8f)) {
            mTargetHeading = info.track.toFloat();
        } else if (info.currentHeading != null) {
            mTargetHeading = info.currentHeading.toFloat();
        } else if (hasTrack) {
            mTargetHeading = info.track.toFloat();
        } else {
            try {
                var posInfo = Position.getInfo();
                if (posInfo != null && posInfo.heading != null) {
                    mTargetHeading = posInfo.heading.toFloat();
                }
            } catch (e) {
            }
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
        var location = info.currentLocation;
        if (location == null) {
            try {
                var posInfo = Position.getInfo();
                if (posInfo != null && posInfo.position != null) {
                    location = posInfo.position;
                }
            } catch (e) {
            }
        }

        if (location == null) {
            if (mGpsLostCount < 5 && mCurrLatMicro != 0) {
                mGpsLostCount++;
            } else {
                mHasGps = false;
                mIsOffCourse = false;
            }
            return;
        }

        var degrees = location.toDegrees();
        var latDeg = degrees[0].toDouble();
        var lonDeg = degrees[1].toDouble();

        // Guard against (0, 0) coordinates if hardware returns null island before fix
        if (latDeg == 0.0d && lonDeg == 0.0d) {
            if (mGpsLostCount < 5 && mCurrLatMicro != 0) {
                mGpsLostCount++;
            } else {
                mHasGps = false;
                mIsOffCourse = false;
            }
            return;
        }

        mGpsLostCount = 0;
        mHasGps = true;
        mHasEverHadGps = true;

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

        // 6. Cross-Track Distance: single-pass nearest distance to full route
        var minDist = 999999.0f;

        for (var i = 0; i < mPointCount - 1; i++) {
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
            if (segLenSq < 0.001f) {
                d = Math.sqrt(ax * ax + ay * ay);
            } else {
                var t = (-ax * vx - ay * vy) / segLenSq;
                if (t < 0.0f) {
                    t = 0.0f;
                } else if (t > 1.0f) {
                    t = 1.0f;
                }
                var qx = ax + t * vx;
                var qy = ay + t * vy;
                d = Math.sqrt(qx * qx + qy * qy);
            }

            if (d < minDist) {
                minDist = d;
            }
        }

        // 7. Off-course alert evaluation
        if (minDist > OFF_COURSE_THRESHOLD_M) {
            mIsOffCourse = true;
            mOffCourseDist = minDist.toNumber();
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
        dc.setColor(COLOR_BLACK, COLOR_BLACK);
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
            if (!mHasEverHadGps) {
                // Initial state: Display WAITING FOR GPS at top, and render full route thumbnail below
                dc.setColor(Graphics.COLOR_YELLOW, Graphics.COLOR_TRANSPARENT);
                var textY = (h * 0.10f).toNumber();
                dc.drawText(cx, textY, Graphics.FONT_TINY, "WAITING FOR GPS", Graphics.TEXT_JUSTIFY_CENTER);

                // Render full route thumbnail with scale-based point decimation
                var thumbCy = (h * 0.54f).toNumber();
                var maxThumbW = (w * 0.62f);
                var maxThumbH = (h * 0.58f);
                renderRouteThumbnail(dc, cx, thumbCy, maxThumbW, maxThumbH);
            } else {
                // GPS connection dropped after having locked previously
                dc.setColor(Graphics.COLOR_YELLOW, Graphics.COLOR_TRANSPARENT);
                dc.drawText(cx, cy - 10, Graphics.FONT_SMALL, "WAITING FOR GPS", Graphics.TEXT_JUSTIFY_CENTER);
            }
            return;
        }

        // 3. 2D rotation matrix: Heading-Up projection
        var heading = mRenderHeading;
        var sinH = Math.sin(heading);
        var cosH = Math.cos(heading);

        // 4. Dynamic zoom scale: screen radius cx maps to mMapRange in meters
        var zoomScale = (cx.toFloat()) / mMapRange;

        // Render route geometry in uniform Electric Cyan (#00e5ff)
        dc.setColor(COLOR_CYAN, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(4);

        for (var i = 0; i < mPointCount - 1; i++) {
            var idxA = i * 2;
            var idxB = (i + 1) * 2;

            var ax = (mPoints[idxA + 1] - mCurrLonMicro) * 1.113195f * mCosLat;
            var ay = (mPoints[idxA] - mCurrLatMicro) * 1.111329f;

            var bx = (mPoints[idxB + 1] - mCurrLonMicro) * 1.113195f * mCosLat;
            var by = (mPoints[idxB] - mCurrLatMicro) * 1.111329f;

            // Viewport culling: skip if both endpoints are outside view radius
            var distSqA = ax * ax + ay * ay;
            var distSqB = bx * bx + by * by;
            if (distSqA > mCullDistSq && distSqB > mCullDistSq) {
                continue;
            }

            // Heading-up 2D projection
            var sx1 = cx + (ax * cosH - ay * sinH) * zoomScale;
            var sy1 = cy - (ay * cosH + ax * sinH) * zoomScale;
            var sx2 = cx + (bx * cosH - by * sinH) * zoomScale;
            var sy2 = cy - (by * cosH + bx * sinH) * zoomScale;

            dc.drawLine(sx1.toNumber(), sy1.toNumber(), sx2.toNumber(), sy2.toNumber());

            // Smooth rounded node caps at vertices
            dc.setColor(COLOR_CYAN, COLOR_CYAN);
            dc.fillCircle(sx1.toNumber(), sy1.toNumber(), 2);
            dc.fillCircle(sx2.toNumber(), sy2.toNumber(), 2);
            dc.setColor(COLOR_CYAN, Graphics.COLOR_TRANSPARENT);
        }

        // 5. Render directional chevrons (50m intervals, 250m multiples are large & prominent)
        if (mShowDirection) {
            for (var k = 0; k < mChevronCount; k++) {
                var cIdx = k * 4;
                var cLat = mChevrons[cIdx];
                var cLon = mChevrons[cIdx + 1];

                var ax = (cLon - mCurrLonMicro) * 1.113195f * mCosLat;
                var ay = (cLat - mCurrLatMicro) * 1.111329f;

                if (ax * ax + ay * ay > mCullDistSq) {
                    continue;
                }

                var sx = cx + (ax * cosH - ay * sinH) * zoomScale;
                var sy = cy - (ay * cosH + ax * sinH) * zoomScale;

                if (sx < -25 || sx > w + 25 || sy < -25 || sy > h + 25) {
                    continue;
                }

                var ux = mChevrons[cIdx + 2].toFloat() / 10000.0f;
                var uy = mChevrons[cIdx + 3].toFloat() / 10000.0f;

                // 2D Rotation of unit vector into screen coordinates
                var sux = (ux * cosH - uy * sinH);
                var suy = -(uy * cosH + ux * sinH);
                var snx = -suy;
                var sny = sux;

                var isMajor = ((k + 1) % 5 == 0); // 250m, 500m, 750m, 1000m...

                if (isMajor) {
                    // Major 250m landmark: prominent large single chevron in Electric Cyan (#00e5ff)
                    dc.setColor(COLOR_CYAN, Graphics.COLOR_TRANSPARENT);
                    dc.setPenWidth(4);

                    var tipX = sx + sux * 9.0f;
                    var tipY = sy + suy * 9.0f;
                    var leftX = sx - sux * 6.0f + snx * 10.0f;
                    var leftY = sy - suy * 6.0f + sny * 10.0f;
                    var rightX = sx - sux * 6.0f - snx * 10.0f;
                    var rightY = sy - suy * 6.0f - sny * 10.0f;
                    dc.drawLine(leftX.toNumber(), leftY.toNumber(), tipX.toNumber(), tipY.toNumber());
                    dc.drawLine(rightX.toNumber(), rightY.toNumber(), tipX.toNumber(), tipY.toNumber());
                } else {
                    // Minor 50m chevron: discreet small single chevron (span ±5px, pen width 2px)
                    dc.setColor(COLOR_CYAN, Graphics.COLOR_TRANSPARENT);
                    dc.setPenWidth(2);

                    var tipX = sx + sux * 5.0f;
                    var tipY = sy + suy * 5.0f;
                    var leftX = sx - sux * 3.0f + snx * 5.0f;
                    var leftY = sy - suy * 3.0f + sny * 5.0f;
                    var rightX = sx - sux * 3.0f - snx * 5.0f;
                    var rightY = sy - suy * 3.0f - sny * 5.0f;

                    dc.drawLine(leftX.toNumber(), leftY.toNumber(), tipX.toNumber(), tipY.toNumber());
                    dc.drawLine(rightX.toNumber(), rightY.toNumber(), tipX.toNumber(), tipY.toNumber());
                }
            }
        }

        // 5. Render smooth firefly comet tail (bioluminescent cold lime green #a3e635)
        if (mTrailCount > 0) {
            var startIdx = (mTrailHead - mTrailCount + TRAIL_CAPACITY) % TRAIL_CAPACITY;
            var numSegs = mTrailCount - 1;

            for (var t = 0; t < numSegs; t++) {
                var p1Idx = ((startIdx + t) % TRAIL_CAPACITY) * 2;
                var p2Idx = ((startIdx + t + 1) % TRAIL_CAPACITY) * 2;

                var tax1 = (mTrailPoints[p1Idx + 1] - mCurrLonMicro) * 1.113195f * mCosLat;
                var tay1 = (mTrailPoints[p1Idx] - mCurrLatMicro) * 1.111329f;
                var tax2 = (mTrailPoints[p2Idx + 1] - mCurrLonMicro) * 1.113195f * mCosLat;
                var tay2 = (mTrailPoints[p2Idx] - mCurrLatMicro) * 1.111329f;

                if (tax1 * tax1 + tay1 * tay1 <= mCullDistSq) {
                    var tsx1 = cx + (tax1 * cosH - tay1 * sinH) * zoomScale;
                    var tsy1 = cy - (tay1 * cosH + tax1 * sinH) * zoomScale;
                    var tsx2 = cx + (tax2 * cosH - tay2 * sinH) * zoomScale;
                    var tsy2 = cy - (tay2 * cosH + tax2 * sinH) * zoomScale;

                    var ratio = (numSegs > 0) ? (t.toFloat() / numSegs.toFloat()) : 1.0f;
                    if (ratio < 0.35f) {
                        dc.setColor(COLOR_LIME_FAINT, Graphics.COLOR_TRANSPARENT);
                        dc.setPenWidth(2);
                    } else if (ratio < 0.70f) {
                        dc.setColor(COLOR_LIME_MID, Graphics.COLOR_TRANSPARENT);
                        dc.setPenWidth(3);
                    } else {
                        dc.setColor(COLOR_LIME, Graphics.COLOR_TRANSPARENT);
                        dc.setPenWidth(5);
                    }

                    dc.drawLine(tsx1.toNumber(), tsy1.toNumber(), tsx2.toNumber(), tsy2.toNumber());
                }
            }

            // Connect newest recorded trail point directly to current runner position (cx, cy + 4)
            var lastPointIdx = ((mTrailHead - 1 + TRAIL_CAPACITY) % TRAIL_CAPACITY) * 2;
            var ltax = (mTrailPoints[lastPointIdx + 1] - mCurrLonMicro) * 1.113195f * mCosLat;
            var ltay = (mTrailPoints[lastPointIdx] - mCurrLatMicro) * 1.111329f;
            var ltsx = cx + (ltax * cosH - ltay * sinH) * zoomScale;
            var ltsy = cy - (ltay * cosH + ltax * sinH) * zoomScale;

            dc.setColor(COLOR_LIME, Graphics.COLOR_TRANSPARENT);
            dc.setPenWidth(5);
            dc.drawLine(ltsx.toNumber(), ltsy.toNumber(), cx, cy + 4);
        }

        // 6. Render 20m milestone firefly sparks (10 dots covering 200m, fixed in world coordinates, fading in place)
        if (mSparkCount > 0) {
            var sparkStartIdx = (mSparkHead - mSparkCount + SPARK_CAPACITY) % SPARK_CAPACITY;
            for (var s = 0; s < mSparkCount; s++) {
                var spIdx = ((sparkStartIdx + s) % SPARK_CAPACITY) * 2;
                var sax = (mSparkPoints[spIdx + 1] - mCurrLonMicro) * 1.113195f * mCosLat;
                var say = (mSparkPoints[spIdx] - mCurrLatMicro) * 1.111329f;

                if (sax * sax + say * say <= mCullDistSq) {
                    var ssx = cx + (sax * cosH - say * sinH) * zoomScale;
                    var ssy = cy - (say * cosH + sax * sinH) * zoomScale;

                    var sparkRatio = (s + 1).toFloat() / mSparkCount.toFloat(); // 0 (oldest) -> 1 (newest)

                    if (sparkRatio < 0.35f) {
                        // Distant dot: faint green dot (fading out)
                        dc.setColor(COLOR_LIME_FAINT, COLOR_LIME_FAINT);
                        dc.fillCircle(ssx.toNumber(), ssy.toNumber(), 2);
                    } else if (sparkRatio < 0.70f) {
                        // Mid-range: lime spark + white core
                        dc.setColor(COLOR_LIME_MID, COLOR_LIME_MID);
                        dc.fillCircle(ssx.toNumber(), ssy.toNumber(), 3);
                        dc.setColor(COLOR_WHITE, COLOR_WHITE);
                        dc.fillCircle(ssx.toNumber(), ssy.toNumber(), 1);
                    } else {
                        // Near runner: glowing lime halo + bright white core
                        dc.setColor(COLOR_LIME, COLOR_LIME);
                        dc.fillCircle(ssx.toNumber(), ssy.toNumber(), 4);
                        dc.setColor(COLOR_WHITE, COLOR_WHITE);
                        dc.fillCircle(ssx.toNumber(), ssy.toNumber(), 2);
                    }
                }
            }
        }

        // 7. Render runner cursor: GPS Navigation Chevron in bioluminescent lime green (#a3e635)

        // (1) Arrow body
        dc.setColor(COLOR_LIME, COLOR_LIME);
        var navDart = [
            [cx, cy - 14],
            [cx + 9, cy + 10],
            [cx, cy + 5],
            [cx - 9, cy + 10]
        ];
        dc.fillPolygon(navDart);

        // (2) Crisp white border outline
        dc.setColor(COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(2);
        dc.drawLine(cx, cy - 14, cx + 9, cy + 10);
        dc.drawLine(cx + 9, cy + 10, cx, cy + 5);
        dc.drawLine(cx, cy + 5, cx - 9, cy + 10);
        dc.drawLine(cx - 9, cy + 10, cx, cy - 14);

        // (3) Center guidance dot
        dc.setColor(COLOR_WHITE, COLOR_WHITE);
        dc.fillCircle(cx, cy - 1, 3);

        // 8. Off-course alert banner
        if (mIsOffCourse) {
            var bannerW = 230;
            var bannerH = 36;
            var bannerX = cx - (bannerW / 2);
            var bannerY = 24;

            dc.setColor(COLOR_ALERT, COLOR_ALERT);
            dc.fillRoundedRectangle(bannerX, bannerY, bannerW, bannerH, 6);

            dc.setColor(COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            var alertText = "OFF COURSE (+" + mOffCourseDist + "m)";
            dc.drawText(cx, bannerY + 6, Graphics.FONT_XTINY, alertText, Graphics.TEXT_JUSTIFY_CENTER);
        }
    }

    //! Renders full route thumbnail preview with scale-based point decimation
    private function renderRouteThumbnail(dc as Graphics.Dc, thumbCx as Number, thumbCy as Number, maxW as Float, maxH as Float) as Void {
        if (mPointCount < 2) {
            return;
        }

        var dLonMicro = (mMaxLon - mMinLon).toFloat();
        var dLatMicro = (mMaxLat - mMinLat).toFloat();

        var dLonMetric = dLonMicro * mRouteCosLat;
        var dLatMetric = dLatMicro;

        if (dLonMetric < 1.0f) {
            dLonMetric = 1.0f;
        }
        if (dLatMetric < 1.0f) {
            dLatMetric = 1.0f;
        }

        var scaleX = maxW / dLonMetric;
        var scaleY = maxH / dLatMetric;
        var thumbScale = (scaleX < scaleY) ? scaleX : scaleY;

        // Dynamic decimation threshold: skip points closer than 3 screen pixels (3^2 = 9)
        var minStepSq = 9;

        // 1. Draw route path in Electric Cyan (#00e5ff)
        dc.setColor(COLOR_CYAN, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(3);

        var firstLon = mPoints[1];
        var firstLat = mPoints[0];
        var lastSx = (thumbCx + ((firstLon - mCenterLon).toFloat() * mRouteCosLat * thumbScale)).toNumber();
        var lastSy = (thumbCy - ((firstLat - mCenterLat).toFloat() * thumbScale)).toNumber();

        var startSx = lastSx;
        var startSy = lastSy;

        for (var i = 1; i < mPointCount; i++) {
            var idx = i * 2;
            var pLat = mPoints[idx];
            var pLon = mPoints[idx + 1];

            var currSx = (thumbCx + ((pLon - mCenterLon).toFloat() * mRouteCosLat * thumbScale)).toNumber();
            var currSy = (thumbCy - ((pLat - mCenterLat).toFloat() * thumbScale)).toNumber();

            var dx = currSx - lastSx;
            var dy = currSy - lastSy;

            if (i == mPointCount - 1 || (dx * dx + dy * dy) >= minStepSq) {
                dc.drawLine(lastSx, lastSy, currSx, currSy);
                dc.fillCircle(lastSx, lastSy, 1);
                lastSx = currSx;
                lastSy = currSy;
            }
        }

        var endSx = lastSx;
        var endSy = lastSy;

        // 2. Start & End markers
        var isLoop = ((startSx - endSx) * (startSx - endSx) + (startSy - endSy) * (startSy - endSy)) < 36;
        if (isLoop) {
            // Closed loop: Bright lime green dot with white core
            dc.setColor(COLOR_LIME, COLOR_LIME);
            dc.fillCircle(startSx, startSy, 5);
            dc.setColor(COLOR_WHITE, COLOR_WHITE);
            dc.fillCircle(startSx, startSy, 2);
        } else {
            // Start marker: Bioluminescent Lime Green dot (#a3e635)
            dc.setColor(COLOR_LIME, COLOR_LIME);
            dc.fillCircle(startSx, startSy, 5);
            dc.setColor(COLOR_WHITE, COLOR_WHITE);
            dc.fillCircle(startSx, startSy, 2);

            // End marker: Electric Cyan dot with white core (#00e5ff)
            dc.setColor(COLOR_CYAN, COLOR_CYAN);
            dc.fillCircle(endSx, endSy, 5);
            dc.setColor(COLOR_WHITE, COLOR_WHITE);
            dc.fillCircle(endSx, endSy, 2);
        }
    }
}
