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
    private const COLOR_CYAN = 0x00E5FF;          // Electric Cyan (#00e5ff) - Full route blueprint
    private const COLOR_DIMMED_CYAN = 0x004047;   // Dimmed Slate-Cyan (Visited segments, 28% luminance)
    private const COLOR_LIME = 0xA3E635;          // Bioluminescent Lime Green (#a3e635) - Runner chevron & sparks
    private const COLOR_LIME_MID = 0x84CC16;      // Mid-range lime (#84cc16)
    private const COLOR_LIME_FAINT = 0x4D7C0F;    // Fading wake green (#4d7c0f)
    private const COLOR_ALERT = 0xDC2626;         // Off-course red alert (#dc2626)
    private const COLOR_WHITE = 0xFFFFFF;         // Crisp pure white (#ffffff)
    private const COLOR_BLACK = 0x000000;         // AMOLED deep black (#000000)
    private const COLOR_BADGE_BG = 0x0F172A;      // Slate 900 background for turn badge
    private const COLOR_BADGE_BORDER = 0x38BDF8;  // Sky blue border for turn badge
    private const COLOR_AMBER_BG = 0xD97706;      // Amber 600 imminent turn background
    private const COLOR_AMBER_BORDER = 0xFBBF24;  // Amber 400 imminent turn border

    // Feature Toggles (Configurable via App Settings)
    private var mDimCompletedPath as Boolean = true;
    private var mShowTurnCue as Boolean = true;
    private var mShowCornerAnchors as Boolean = true;

    // Dynamic path dimming: Visited Segments tracking & arbitrary start / loop support
    private var mVisitedSegments as Array<Boolean> = [] as Array<Boolean>;
    private var mCurrentSegmentIndex as Number = 0;
    private var mCurrentSegmentProgress as Float = 0.0f;

    // Precomputed sharp corner anchors (angle >= 38 degrees)
    private var mCornerIndices as Array<Number> = [] as Array<Number>;
    private var mCornerAngles as Array<Number> = [] as Array<Number>;
    private var mCornerCount as Number = 0;

    // Upcoming Turn Cue state
    private var mTurnDist as Number = -1;       // Distance in meters to next turn (-1 = none)
    private var mTurnDirection as Number = 0;   // +1 = Right, -1 = Left

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

    // Route dimensions & statistics for smart full preview
    private var mTotalRouteMeters as Float = 0.0f;
    private var mBoxWidthMeters as Float = 0.0f;
    private var mBoxHeightMeters as Float = 0.0f;
    private var mPreviewMode as Boolean = false;
    private var mDistToStart as Number = 0;
    private var mBearingToStart as Float = 0.0f;

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

        // 3. Load feature settings
        try {
            var showDirVal = Properties.getValue("showDirection");
            mShowDirection = (showDirVal != null && showDirVal instanceof Boolean) ? showDirVal : true;
        } catch (e) {
            mShowDirection = true;
        }

        try {
            var dimVal = Properties.getValue("dimCompletedPath");
            mDimCompletedPath = (dimVal != null && dimVal instanceof Boolean) ? dimVal : true;
        } catch (e) {
            mDimCompletedPath = true;
        }

        try {
            var turnVal = Properties.getValue("showTurnCue");
            mShowTurnCue = (turnVal != null && turnVal instanceof Boolean) ? turnVal : true;
        } catch (e) {
            mShowTurnCue = true;
        }

        try {
            var anchorVal = Properties.getValue("showCornerAnchors");
            mShowCornerAnchors = (anchorVal != null && anchorVal instanceof Boolean) ? anchorVal : true;
        } catch (e) {
            mShowCornerAnchors = true;
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

            // Bounding box dimensions in meters
            mBoxWidthMeters = (mMaxLon - mMinLon).toFloat() * 1.113195f * mRouteCosLat;
            mBoxHeightMeters = (mMaxLat - mMinLat).toFloat() * 1.111329f;
        } else {
            mMinLat = 0;
            mMaxLat = 0;
            mMinLon = 0;
            mMaxLon = 0;
            mCenterLat = 0;
            mCenterLon = 0;
            mRouteCosLat = 1.0f;
            mBoxWidthMeters = 0.0f;
            mBoxHeightMeters = 0.0f;
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
            mTotalRouteMeters = totalMeters;

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

        // Initialize Visited Segments tracking
        if (mPointCount >= 2) {
            var numSegs = mPointCount - 1;
            mVisitedSegments = new [numSegs] as Array<Boolean>;
            for (var s = 0; s < numSegs; s++) {
                mVisitedSegments[s] = false;
            }
        } else {
            mVisitedSegments = [] as Array<Boolean>;
        }
        mCurrentSegmentIndex = 0;
        mCurrentSegmentProgress = 0.0f;
        mTurnDist = -1;
        mTurnDirection = 0;

        // Precompute sharp corner anchors (turning intersections where angle >= 38 degrees)
        if (mPointCount >= 3) {
            var rawCorners = new [mPointCount] as Array<Number>;
            var rawAngles = new [mPointCount] as Array<Number>;
            var cornerCount = 0;

            for (var i = 1; i < mPointCount - 1; i++) {
                var p0Lat = mPoints[(i - 1) * 2];
                var p0Lon = mPoints[(i - 1) * 2 + 1];
                var p1Lat = mPoints[i * 2];
                var p1Lon = mPoints[i * 2 + 1];
                var p2Lat = mPoints[(i + 1) * 2];
                var p2Lon = mPoints[(i + 1) * 2 + 1];

                var v1x = (p1Lon - p0Lon) * 1.113195f * mRouteCosLat;
                var v1y = (p1Lat - p0Lat) * 1.111329f;
                var v2x = (p2Lon - p1Lon) * 1.113195f * mRouteCosLat;
                var v2y = (p2Lat - p1Lat) * 1.111329f;

                var a1 = Math.atan2(v1x, v1y);
                var a2 = Math.atan2(v2x, v2y);
                var diff = a2 - a1;
                while (diff > Math.PI) {
                    diff -= 2 * Math.PI;
                }
                while (diff < -Math.PI) {
                    diff += 2 * Math.PI;
                }

                var deg = (diff * 180.0f / Math.PI).toNumber();
                var absDeg = (deg < 0) ? -deg : deg;
                if (absDeg >= 38) {
                    rawCorners[cornerCount] = i;
                    rawAngles[cornerCount] = deg;
                    cornerCount++;
                }
            }

            mCornerCount = cornerCount;
            mCornerIndices = new [cornerCount] as Array<Number>;
            mCornerAngles = new [cornerCount] as Array<Number>;
            for (var c = 0; c < cornerCount; c++) {
                mCornerIndices[c] = rawCorners[c];
                mCornerAngles[c] = rawAngles[c];
            }
        } else {
            mCornerCount = 0;
            mCornerIndices = [] as Array<Number>;
            mCornerAngles = [] as Array<Number>;
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
            mTurnDist = -1;
            return;
        }

        // 6. Cross-Track Distance & Progress-Aware Forward Search Window
        var minDist = 999999.0f;
        var bestSeg = mCurrentSegmentIndex;
        var bestT = 0.0f;

        // (A) Priority window: [mCurrentSegmentIndex - 2, mCurrentSegmentIndex + 4]
        var startSearch = mCurrentSegmentIndex - 2;
        if (startSearch < 0) {
            startSearch = 0;
        }
        var endSearch = mCurrentSegmentIndex + 4;
        if (endSearch > mPointCount - 2) {
            endSearch = mPointCount - 2;
        }

        for (var i = startSearch; i <= endSearch; i++) {
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
                t = 0.0f;
            } else {
                t = (-ax * vx - ay * vy) / segLenSq;
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
                bestSeg = i;
                bestT = t;
            }
        }

        // (B) Fallback Global Search if runner deviated or started mid-route (> 45m from window)
        if (minDist > 45.0f) {
            for (var i = 0; i < mPointCount - 1; i++) {
                if (i >= startSearch && i <= endSearch) {
                    continue;
                }
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
                    t = 0.0f;
                } else {
                    t = (-ax * vx - ay * vy) / segLenSq;
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
                    bestSeg = i;
                    bestT = t;
                }
            }
        }

        // Update progress if on-course (< 45m)
        if (minDist <= 45.0f) {
            mCurrentSegmentIndex = bestSeg;
            mCurrentSegmentProgress = bestT;
            if (mCurrentSegmentIndex >= 0 && mCurrentSegmentIndex < mVisitedSegments.size()) {
                mVisitedSegments[mCurrentSegmentIndex] = true;
            }

            // Loop wrap-around support: if at the end of route but earlier segments remain unvisited
            if (mCurrentSegmentIndex >= mPointCount - 2 && bestT > 0.85f) {
                var hasUnvisited = false;
                for (var v = 0; v < mVisitedSegments.size(); v++) {
                    if (!mVisitedSegments[v]) {
                        hasUnvisited = true;
                        break;
                    }
                }
                if (hasUnvisited) {
                    // Check distance to segment 0
                    var p0A = 0;
                    var d0x = (mPoints[p0A + 1] - mCurrLonMicro) * 1.113195f * mCosLat;
                    var d0y = (mPoints[p0A] - mCurrLatMicro) * 1.111329f;
                    if (Math.sqrt(d0x * d0x + d0y * d0y) < 50.0f) {
                        mCurrentSegmentIndex = 0;
                        mCurrentSegmentProgress = 0.0f;
                    }
                }
            }
        }

        // 7. Distance & bearing to Start point (used for Preview Mode guidance)
        var pStartLon = mPoints[1];
        var pStartLat = mPoints[0];
        var dStartLonM = (pStartLon - mCurrLonMicro) * 1.113195f * mCosLat;
        var dStartLatM = (pStartLat - mCurrLatMicro) * 1.111329f;
        var distToStart = Math.sqrt(dStartLonM * dStartLonM + dStartLatM * dStartLatM);
        mDistToStart = distToStart.toNumber();
        mBearingToStart = Math.atan2(dStartLonM, dStartLatM);

        // Smart Route Preview Trigger:
        // When runner is far from the route (> 250m), activate full preview mode!
        if (minDist > 250.0f) {
            mPreviewMode = true;
            mIsOffCourse = false;
        } else {
            mPreviewMode = false;
            // Off-course alert evaluation (only when active in live navigation mode)
            if (minDist > OFF_COURSE_THRESHOLD_M) {
                mIsOffCourse = true;
                mOffCourseDist = minDist.toNumber();
            } else {
                mIsOffCourse = false;
                mOffCourseDist = 0;
            }
        }

        // 8. Upcoming Turn Cue computation (< 60m)
        mTurnDist = -1;
        mTurnDirection = 0;
        if (mShowTurnCue && !mIsOffCourse && mCornerCount > 0) {
            for (var c = 0; c < mCornerCount; c++) {
                var cornerIdx = mCornerIndices[c];
                if (cornerIdx > mCurrentSegmentIndex) {
                    var distAhead = 0.0f;
                    var curA = mCurrentSegmentIndex * 2;
                    var curB = (mCurrentSegmentIndex + 1) * 2;
                    var cdx = (mPoints[curB + 1] - mPoints[curA + 1]) * 1.113195f * mCosLat;
                    var cdy = (mPoints[curB] - mPoints[curA]) * 1.111329f;
                    var curSegLen = Math.sqrt(cdx * cdx + cdy * cdy);
                    distAhead = curSegLen * (1.0f - mCurrentSegmentProgress);

                    for (var s = mCurrentSegmentIndex + 1; s < cornerIdx; s++) {
                        var sA = s * 2;
                        var sB = (s + 1) * 2;
                        var sdx = (mPoints[sB + 1] - mPoints[sA + 1]) * 1.113195f * mCosLat;
                        var sdy = (mPoints[sB] - mPoints[sA]) * 1.111329f;
                        distAhead += Math.sqrt(sdx * sdx + sdy * sdy);
                        if (distAhead > 70.0f) {
                            break;
                        }
                    }

                    if (distAhead <= 60.0f) {
                        mTurnDist = distAhead.toNumber();
                        mTurnDirection = (mCornerAngles[c] > 0) ? 1 : -1;
                    }
                    break;
                }
            }
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

        // 3. Waiting for GPS OR Far Away Route Preview (> 250m from route)
        if (!mHasGps || mPreviewMode) {
            renderRoutePreview(dc, cx, cy, w, h);
            return;
        }

        // 3. 2D rotation matrix: Heading-Up projection
        var heading = mRenderHeading;
        var sinH = Math.sin(heading);
        var cosH = Math.cos(heading);

        // 4. Dynamic zoom scale: screen radius cx maps to mMapRange in meters
        var zoomScale = (cx.toFloat()) / mMapRange;

        // 4. Render route geometry (Visited segments dimmed, upcoming vibrant cyan)
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

            var isVisited = (mVisitedSegments != null && i < mVisitedSegments.size() && mVisitedSegments[i]);
            var isCurrent = (i == mCurrentSegmentIndex);

            if (mDimCompletedPath && isVisited && !isCurrent) {
                // Truly visited segment: Dimmed Slate-Cyan (keeps GPS art pattern visible)
                dc.setColor(COLOR_DIMMED_CYAN, Graphics.COLOR_TRANSPARENT);
                dc.setPenWidth(3);
                dc.drawLine(sx1.toNumber(), sy1.toNumber(), sx2.toNumber(), sy2.toNumber());
            } else if (mDimCompletedPath && isCurrent) {
                // Current segment: split into traversed (dimmed) and upcoming (cyan)
                var t = mCurrentSegmentProgress;
                var midX = sx1 + (sx2 - sx1) * t;
                var midY = sy1 + (sy2 - sy1) * t;

                // Past portion
                dc.setColor(COLOR_DIMMED_CYAN, Graphics.COLOR_TRANSPARENT);
                dc.setPenWidth(3);
                dc.drawLine(sx1.toNumber(), sy1.toNumber(), midX.toNumber(), midY.toNumber());

                // Upcoming portion
                dc.setColor(COLOR_CYAN, Graphics.COLOR_TRANSPARENT);
                dc.setPenWidth(4);
                dc.drawLine(midX.toNumber(), midY.toNumber(), sx2.toNumber(), sy2.toNumber());

                // Smooth node caps
                dc.setColor(COLOR_DIMMED_CYAN, COLOR_DIMMED_CYAN);
                dc.fillCircle(sx1.toNumber(), sy1.toNumber(), 2);
                dc.setColor(COLOR_CYAN, COLOR_CYAN);
                dc.fillCircle(sx2.toNumber(), sy2.toNumber(), 2);
            } else {
                // Upcoming unvisited segment: Vibrant Electric Cyan 4px
                dc.setColor(COLOR_CYAN, Graphics.COLOR_TRANSPARENT);
                dc.setPenWidth(4);
                dc.drawLine(sx1.toNumber(), sy1.toNumber(), sx2.toNumber(), sy2.toNumber());

                // Smooth rounded node caps at vertices
                dc.setColor(COLOR_CYAN, COLOR_CYAN);
                dc.fillCircle(sx1.toNumber(), sy1.toNumber(), 2);
                dc.fillCircle(sx2.toNumber(), sy2.toNumber(), 2);
            }
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

        // 5b. Render Corner Anchor Beacon Dots (Key turning intersections)
        if (mShowCornerAnchors && mCornerCount > 0) {
            for (var c = 0; c < mCornerCount; c++) {
                var cPointIdx = mCornerIndices[c];
                var cLat = mPoints[cPointIdx * 2];
                var cLon = mPoints[cPointIdx * 2 + 1];

                var ax = (cLon - mCurrLonMicro) * 1.113195f * mCosLat;
                var ay = (cLat - mCurrLatMicro) * 1.111329f;

                if (ax * ax + ay * ay > mCullDistSq) {
                    continue;
                }

                var sx = cx + (ax * cosH - ay * sinH) * zoomScale;
                var sy = cy - (ay * cosH + ax * sinH) * zoomScale;

                if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) {
                    continue;
                }

                var isPassed = (mDimCompletedPath && mVisitedSegments != null && cPointIdx < mVisitedSegments.size() && mVisitedSegments[cPointIdx]);

                if (isPassed) {
                    // Dimmed past corner dot
                    dc.setColor(COLOR_DIMMED_CYAN, COLOR_DIMMED_CYAN);
                    dc.fillCircle(sx.toNumber(), sy.toNumber(), 3);
                } else {
                    // Upcoming sharp corner: glowing halo ring + bright white core
                    dc.setColor(COLOR_DIMMED_CYAN, COLOR_DIMMED_CYAN);
                    dc.fillCircle(sx.toNumber(), sy.toNumber(), 6);
                    dc.setColor(COLOR_CYAN, COLOR_CYAN);
                    dc.fillCircle(sx.toNumber(), sy.toNumber(), 3);
                    dc.setColor(COLOR_WHITE, COLOR_WHITE);
                    dc.fillCircle(sx.toNumber(), sy.toNumber(), 1);
                }
            }
        }

        // 6. Render smooth firefly comet tail (bioluminescent cold lime green #a3e635)
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

        // 9. Upcoming Turn Cue Badge (< 60m from corner)
        if (mShowTurnCue && !mIsOffCourse && mTurnDist >= 0 && mTurnDist <= 60) {
            var badgeW = 86;
            var badgeH = 28;
            var badgeX = cx + 30;
            var badgeY = cy - 144;

            var isImminent = (mTurnDist <= 20);
            var bgColor = isImminent ? COLOR_AMBER_BG : COLOR_BADGE_BG;
            var borderColor = isImminent ? COLOR_AMBER_BORDER : COLOR_BADGE_BORDER;

            // Background & border
            dc.setColor(bgColor, bgColor);
            dc.fillRoundedRectangle(badgeX, badgeY, badgeW, badgeH, 6);
            dc.setColor(borderColor, Graphics.COLOR_TRANSPARENT);
            dc.setPenWidth(2);
            dc.drawRoundedRectangle(badgeX, badgeY, badgeW, badgeH, 6);

            // Vector Turn Arrow
            dc.setColor(COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.setPenWidth(2);

            var arrowCornerY = badgeY + 9;
            var arrowStemY = badgeY + 19;

            if (mTurnDirection > 0) {
                // Right Turn Arrow
                var arrowStemX = badgeX + 11;
                var arrowHeadX = badgeX + 22;
                dc.drawLine(arrowStemX, arrowStemY, arrowStemX, arrowCornerY);
                dc.drawLine(arrowStemX, arrowCornerY, arrowHeadX, arrowCornerY);
                dc.drawLine(arrowHeadX, arrowCornerY, arrowHeadX - 4, arrowCornerY - 4);
                dc.drawLine(arrowHeadX, arrowCornerY, arrowHeadX - 4, arrowCornerY + 4);
            } else {
                // Left Turn Arrow
                var arrowStemX = badgeX + 22;
                var arrowHeadX = badgeX + 11;
                dc.drawLine(arrowStemX, arrowStemY, arrowStemX, arrowCornerY);
                dc.drawLine(arrowStemX, arrowCornerY, arrowHeadX, arrowCornerY);
                dc.drawLine(arrowHeadX, arrowCornerY, arrowHeadX + 4, arrowCornerY - 4);
                dc.drawLine(arrowHeadX, arrowCornerY, arrowHeadX + 4, arrowCornerY + 4);
            }

            // Distance text e.g. "45m"
            var distText = mTurnDist + "m";
            dc.setColor(COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(badgeX + 28, badgeY + (badgeH / 2), Graphics.FONT_XTINY, distText, Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
        }
    }

    //! Renders full route preview with Bounding Box Dimensions, Adaptive Scale Bar, and Start Bearing Guidance
    private function renderRoutePreview(dc as Graphics.Dc, cx as Number, cy as Number, w as Number, h as Number) as Void {
        if (mPointCount < 2) {
            return;
        }

        // 1. Top Header: Title, Total Route Length, and Bounding Box (Width x Height)
        dc.setColor(COLOR_CYAN, Graphics.COLOR_TRANSPARENT);
        var totalDistStr = "";
        if (mTotalRouteMeters >= 1000.0f) {
            totalDistStr = (mTotalRouteMeters / 1000.0f).format("%.1f") + " km";
        } else {
            totalDistStr = mTotalRouteMeters.toNumber() + " m";
        }
        dc.drawText(cx, 18, Graphics.FONT_XTINY, "GPS ART (" + totalDistStr + ")", Graphics.TEXT_JUSTIFY_CENTER);

        // Bounding box dimensions e.g. "W 1.8k  H 2.4k"
        var wStr = "";
        if (mBoxWidthMeters >= 1000.0f) {
            wStr = "W " + (mBoxWidthMeters / 1000.0f).format("%.1f") + "k";
        } else {
            wStr = "W " + mBoxWidthMeters.toNumber() + "m";
        }
        var hStr = "";
        if (mBoxHeightMeters >= 1000.0f) {
            hStr = "H " + (mBoxHeightMeters / 1000.0f).format("%.1f") + "k";
        } else {
            hStr = "H " + mBoxHeightMeters.toNumber() + "m";
        }
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, 38, Graphics.FONT_XTINY, wStr + "  " + hStr, Graphics.TEXT_JUSTIFY_CENTER);

        // 2. Compute route thumbnail placement & scaling
        var thumbCy = (h * 0.49f).toNumber();
        var maxThumbW = (w * 0.65f);
        var maxThumbH = (h * 0.46f);

        var dLonMicro = (mMaxLon - mMinLon).toFloat();
        var dLatMicro = (mMaxLat - mMinLat).toFloat();

        var dLonMetric = dLonMicro * mRouteCosLat;
        var dLatMetric = dLatMicro;

        if (dLonMetric < 1.0f) { dLonMetric = 1.0f; }
        if (dLatMetric < 1.0f) { dLatMetric = 1.0f; }

        var scaleX = maxThumbW / dLonMetric;
        var scaleY = maxThumbH / dLatMetric;
        var thumbScale = (scaleX < scaleY) ? scaleX : scaleY;

        // Dynamic decimation threshold: skip points closer than 3 screen pixels (3^2 = 9)
        var minStepSq = 9;

        // Draw route path in Electric Cyan (#00e5ff)
        dc.setColor(COLOR_CYAN, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(3);

        var firstLon = mPoints[1];
        var firstLat = mPoints[0];
        var lastSx = (cx + ((firstLon - mCenterLon).toFloat() * mRouteCosLat * thumbScale)).toNumber();
        var lastSy = (thumbCy - ((firstLat - mCenterLat).toFloat() * thumbScale)).toNumber();

        var startSx = lastSx;
        var startSy = lastSy;

        for (var i = 1; i < mPointCount; i++) {
            var idx = i * 2;
            var pLat = mPoints[idx];
            var pLon = mPoints[idx + 1];

            var currSx = (cx + ((pLon - mCenterLon).toFloat() * mRouteCosLat * thumbScale)).toNumber();
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

        // Start & End markers
        var isLoop = ((startSx - endSx) * (startSx - endSx) + (startSy - endSy) * (startSy - endSy)) < 36;
        if (isLoop) {
            dc.setColor(COLOR_LIME, COLOR_LIME);
            dc.fillCircle(startSx, startSy, 5);
            dc.setColor(COLOR_WHITE, COLOR_WHITE);
            dc.fillCircle(startSx, startSy, 2);
        } else {
            dc.setColor(COLOR_LIME, COLOR_LIME);
            dc.fillCircle(startSx, startSy, 5);
            dc.setColor(COLOR_WHITE, COLOR_WHITE);
            dc.fillCircle(startSx, startSy, 2);

            dc.setColor(COLOR_CYAN, COLOR_CYAN);
            dc.fillCircle(endSx, endSy, 5);
            dc.setColor(COLOR_WHITE, COLOR_WHITE);
            dc.fillCircle(endSx, endSy, 2);
        }

        // 3. Adaptive Visual Scale Bar (|── 500m ──|)
        var pixelsPerMeter = (thumbScale / 1.113195f);
        if (pixelsPerMeter > 0.00001f) {
            var targetSteps = [50, 100, 200, 500, 1000, 2000, 5000, 10000];
            var bestStep = 500;
            var bestDiff = 9999.0f;
            for (var s = 0; s < targetSteps.size(); s++) {
                var barPixels = targetSteps[s] * pixelsPerMeter;
                var diff = (barPixels - 55.0f);
                if (diff < 0) { diff = -diff; }
                if (diff < bestDiff) {
                    bestDiff = diff;
                    bestStep = targetSteps[s];
                }
            }

            var barW = (bestStep * pixelsPerMeter).toNumber();
            if (barW < 24) { barW = 24; }
            if (barW > 120) { barW = 120; }
            var barX = cx - (barW / 2);
            var barY = (h * 0.76f).toNumber();

            dc.setColor(COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.setPenWidth(2);
            // Horizontal bar
            dc.drawLine(barX, barY, barX + barW, barY);
            // Left tick
            dc.drawLine(barX, barY - 4, barX, barY + 4);
            // Right tick
            dc.drawLine(barX + barW, barY - 4, barX + barW, barY + 4);

            var scaleLabel = (bestStep >= 1000) ? (bestStep / 1000) + " km" : bestStep + " m";
            dc.drawText(cx, barY - 15, Graphics.FONT_XTINY, scaleLabel, Graphics.TEXT_JUSTIFY_CENTER);
        }

        // 4. Bottom Footer: Guidance to Start or Waiting for GPS
        if (!mHasGps) {
            dc.setColor(Graphics.COLOR_YELLOW, Graphics.COLOR_TRANSPARENT);
            var gpsMsg = mHasEverHadGps ? "GPS LOST - SEARCHING..." : "WAITING FOR GPS...";
            dc.drawText(cx, (h * 0.85f).toNumber(), Graphics.FONT_XTINY, gpsMsg, Graphics.TEXT_JUSTIFY_CENTER);
        } else {
            // Pill banner with distance and direction arrow to Start point
            var pillW = 200;
            var pillH = 28;
            var pillX = cx - (pillW / 2);
            var pillY = (h * 0.85f).toNumber();

            dc.setColor(COLOR_BADGE_BG, COLOR_BADGE_BG);
            dc.fillRoundedRectangle(pillX, pillY, pillW, pillH, 8);
            dc.setColor(COLOR_BADGE_BORDER, Graphics.COLOR_TRANSPARENT);
            dc.setPenWidth(1);
            dc.drawRoundedRectangle(pillX, pillY, pillW, pillH, 8);

            // Vector arrow pointing to Start
            var relAngle = mBearingToStart - mRenderHeading;
            var arrowCx = pillX + 22;
            var arrowCy = pillY + 14;
            var adx = Math.sin(relAngle) * 7.0f;
            var ady = -Math.cos(relAngle) * 7.0f;

            dc.setColor(COLOR_LIME, Graphics.COLOR_TRANSPARENT);
            dc.setPenWidth(2);
            dc.drawLine((arrowCx - adx * 0.5f).toNumber(), (arrowCy - ady * 0.5f).toNumber(), (arrowCx + adx).toNumber(), (arrowCy + ady).toNumber());
            var sideAngle1 = relAngle + 2.5f;
            var sideAngle2 = relAngle - 2.5f;
            dc.drawLine((arrowCx + adx).toNumber(), (arrowCy + ady).toNumber(), (arrowCx + adx + Math.sin(sideAngle1) * 4.0f).toNumber(), (arrowCy + ady - Math.cos(sideAngle1) * 4.0f).toNumber());
            dc.drawLine((arrowCx + adx).toNumber(), (arrowCy + ady).toNumber(), (arrowCx + adx + Math.sin(sideAngle2) * 4.0f).toNumber(), (arrowCy + ady - Math.cos(sideAngle2) * 4.0f).toNumber());

            var startDistStr = "";
            if (mDistToStart >= 1000) {
                startDistStr = (mDistToStart.toFloat() / 1000.0f).format("%.1f") + " km";
            } else {
                startDistStr = mDistToStart + " m";
            }
            dc.setColor(COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(pillX + 38, pillY + 4, Graphics.FONT_XTINY, "TO START: " + startDistStr, Graphics.TEXT_JUSTIFY_LEFT);
        }
    }
}
