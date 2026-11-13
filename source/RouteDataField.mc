import Toybox.Activity;
import Toybox.Application.Properties;
import Toybox.Attention;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.Position;
import Toybox.System;
import Toybox.WatchUi;

//! "He-Kim-Koo (Firefly)" GPS Breadcrumb Art Navigation Data Field
//! Tailored for Garmin Venu 2 Plus (416x416 AMOLED)
//! Features: Bioluminescent theme, smooth angular interpolation, progress-based coloring, 20m milestone sparks, and viewport culling.
class RouteDataField extends WatchUi.DataField {

    // =========================================================================
    // Mathematical & Navigation Constants (32-bit Float to avoid Double boxing)
    // =========================================================================
    private const PI = 3.1415927f;
    private const TWO_PI = 6.2831853f;
    private const DEG_TO_RAD = 0.017453292f;
    private const RAD_TO_DEG = 57.29578f;

    // Metric conversion factors for microdegrees (1e-5 deg)
    private const METERS_PER_MICRO_LAT = 1.111329f;
    private const METERS_PER_MICRO_LON = 1.113195f;

    // Navigation & threshold constants
    private const DEFAULT_MAP_RANGE_M = 175.0f;
    private const CULL_MARGIN_FACTOR = 1.30f;
    private const OFF_COURSE_THRESHOLD_M = 35.0f;
    private const OFF_COURSE_CLEAR_THRESHOLD_M = 25.0f;
    private const GPS_QUALITY_USABLE = 3;        // Position.QUALITY_USABLE
    private const SNAP_LOCK_DIST_SQ = 2025.0f;   // 45.0m^2
    private const CURRENT_SEG_CONTINUITY_FACTOR = 0.64f; // 0.8^2 (~20% distance hysteresis bonus)
    private const PREVIEW_DIST_M = 250.0f;
    private const TURN_CUE_MAX_DIST_M = 60.0f;
    private const CORNER_MIN_ANGLE_DEG = 38;

    // Buffer capacities
    private const TRAIL_CAPACITY = 24;           // 24 pts @ 5m step (~120m stream)
    private const TRAIL_STEP_DIST_SQ = 25.0f;    // 5.0m^2
    private const SPARK_CAPACITY = 10;           // 10 pts @ 20m step (~200m milestones)
    private const SPARK_STEP_DIST_SQ = 400.0f;   // 20.0m^2

    // =========================================================================
    // Bioluminescent AMOLED Theme Colors (1:1 match with web simulator)
    // =========================================================================
    private const COLOR_CYAN = 0x00E5FF;         // Electric Cyan (#00e5ff) - Active route blueprint
    private const COLOR_DIMMED_CYAN = 0x004047;  // Dimmed Slate-Cyan (Visited segments, 28% luminance)
    private const COLOR_LIME = 0xA3E635;         // Bioluminescent Lime Green (#a3e635) - Runner & sparks
    private const COLOR_LIME_MID = 0x84CC16;     // Mid-range lime (#84cc16)
    private const COLOR_LIME_FAINT = 0x4D7C0F;   // Fading wake green (#4d7c0f)
    private const COLOR_ALERT = 0xDC2626;        // Off-course red alert (#dc2626)
    private const COLOR_WHITE = 0xFFFFFF;        // Crisp pure white (#ffffff)
    private const COLOR_BLACK = 0x000000;        // AMOLED deep black (#000000)
    private const COLOR_BADGE_BG = 0x0F172A;     // Slate 900 background for turn badge
    private const COLOR_BADGE_BORDER = 0x38BDF8; // Sky blue border for turn badge
    private const COLOR_AMBER_BG = 0xD97706;     // Amber 600 imminent turn background
    private const COLOR_AMBER_BORDER = 0xFBBF24; // Amber 400 imminent turn border

    // =========================================================================
    // Configurable Display Settings
    // =========================================================================
    private var mMapRange as Float = DEFAULT_MAP_RANGE_M;
    private var mCullDistSq as Float = 51870.25f;
    private var mShowDirection as Boolean = true;
    private var mDimCompletedPath as Boolean = true;
    private var mShowTurnCue as Boolean = true;
    private var mShowCornerAnchors as Boolean = true;
    private var mShowProgress as Boolean = true;
    private var mEnableVibration as Boolean = true;

    // =========================================================================
    // Route Geometry & Precomputed Lookup Tables
    // =========================================================================
    // Flat microdegree coordinates [lat0, lon0, lat1, lon1, ...]
    var mPoints as Array<Number> = [] as Array<Number>;
    var mPointCount as Number = 0;
    private var mRouteStatus as Number = PolylineDecoder.STATUS_EMPTY;
    private var mRouteTotalPoints as Number = 0;

    // Cumulative distances at each vertex in meters [0.0, d1, d2, ...]
    private var mCumDist as Array<Float> = [] as Array<Float>;

    // Packed 32-bit bitfield for visited segments (5 ints = 160 bits, < 20 Bytes heap)
    private var mVisitedBits as Array<Number> = [0, 0, 0, 0, 0] as Array<Number>;
    private var mVisitedCount as Number = 0;
    private var mCurrentSegmentIndex as Number = 0;
    private var mCurrentSegmentProgress as Float = 0.0f;
    private var mCoveredMeters as Float = 0.0f;
    private var mIsCompleted as Boolean = false;
    private var mLastVibedCornerIdx as Number = -1;
    private var mLastOffCourseVibeMs as Number = 0;
    private var mLoadedRouteStr as String? = null;
    private var mLoadedRouteDir as Number = -1;
    private var mHasLoadedRouteOnce as Boolean = false;

    // Precomputed sharp corner anchors (angle >= 38 degrees)
    private var mCornerIndices as Array<Number> = [] as Array<Number>;
    private var mCornerAngles as Array<Number> = [] as Array<Number>;
    private var mCornerCount as Number = 0;

    // Route bounding box & preview statistics
    var mMinLat as Number = 0;
    var mMaxLat as Number = 0;
    var mMinLon as Number = 0;
    var mMaxLon as Number = 0;
    var mCenterLat as Number = 0;
    var mCenterLon as Number = 0;
    var mRouteCosLat as Float = 1.0f;
    private var mRouteMetersPerLon as Float = METERS_PER_MICRO_LON;
    var mTotalRouteMeters as Float = 0.0f;

    // =========================================================================
    // Real-Time GPS, Heading & Navigation State
    // =========================================================================
    var mHasGps as Boolean = false;
    var mHasEverHadGps as Boolean = false;
    private var mGpsLostCount as Number = 0;
    var mCurrLatMicro as Number = 0;
    var mCurrLonMicro as Number = 0;
    private var mCosLat as Float = 1.0f;
    private var mMetersPerLon as Float = METERS_PER_MICRO_LON;

    // Heading smoothing filter (prevents snapping during sharp turns)
    private var mTargetHeading as Float = 0.0f;
    var mRenderHeading as Float = 0.0f;

    // Heading history ring buffer (4 samples @ 1Hz) for noise-free baseline displacement
    private const HEADING_HIST_CAPACITY = 4;
    private var mHeadingHistLat as Array<Number> = new [HEADING_HIST_CAPACITY] as Array<Number>;
    private var mHeadingHistLon as Array<Number> = new [HEADING_HIST_CAPACITY] as Array<Number>;
    private var mHeadingHistHead as Number = 0;
    private var mHeadingHistCount as Number = 0;
    private var mCompassReliable as Boolean = true;
    private var mCompassBadCount as Number = 0;

    // Navigation status & alerts
    private var mPreviewMode as Boolean = false;
    var mDistToStart as Number = 0;
    var mBearingToStart as Float = 0.0f;
    private var mIsOffCourse as Boolean = false;
    private var mOffCourseDist as Number = 0;
    private var mOffCourseCount as Number = 0;
    private var mGpsAccuracy as Number = GPS_QUALITY_USABLE;
    private var mSpeedMps as Float = 0.0f;
    private var mHasNavHeading as Boolean = false;
    private var mTurnDist as Number = -1;       // Distance in meters to next turn (-1 = none)
    private var mTurnDirection as Number = 0;   // +1 = Right, -1 = Left

    // =========================================================================
    // Firefly Trail & 20m Milestone Spark Ring Buffers
    // =========================================================================
    private var mTrailPoints as Array<Number> = new [TRAIL_CAPACITY * 2] as Array<Number>;
    private var mTrailCount as Number = 0;
    private var mTrailHead as Number = 0;
    private var mLastTrailLat as Number = 0;
    private var mLastTrailLon as Number = 0;

    private var mSparkPoints as Array<Number> = new [SPARK_CAPACITY * 2] as Array<Number>;
    private var mSparkCount as Number = 0;
    private var mSparkHead as Number = 0;
    private var mLastSparkLat as Number = 0;
    private var mLastSparkLon as Number = 0;

    // =========================================================================
    // Cached Screen Layout & Pre-Allocated Cursor Polygon
    // =========================================================================
    var mScreenW as Number = 0;
    var mScreenH as Number = 0;
    var mCenterX as Number = 0;
    var mCenterY as Number = 0;
    private var mNavDart as Array<[Numeric, Numeric]> = [
        [0, 0],
        [0, 0],
        [0, 0],
        [0, 0]
    ] as Array<[Numeric, Numeric]>;
    var mPolygonBuf as Array<[Numeric, Numeric]> = [
        [0, 0],
        [0, 0],
        [0, 0],
        [0, 0]
    ] as Array<[Numeric, Numeric]>;

    // =========================================================================
    // Lifecycle & Initialization
    // =========================================================================
    function initialize() {
        DataField.initialize();
        reloadRoute();
    }

    function onLayout(dc as Graphics.Dc) as Void {
        updateLayoutCache(dc.getWidth(), dc.getHeight());
    }

    private function updateLayoutCache(w as Number, h as Number) as Void {
        if (w == mScreenW && h == mScreenH) {
            return;
        }
        mScreenW = w;
        mScreenH = h;
        var cx = w / 2;
        var cy = h / 2;
        mCenterX = cx;
        mCenterY = cy;

        // Pre-compute runner chevron polygon vertices once per layout change
        mNavDart[0][0] = cx;
        mNavDart[0][1] = cy - 14;
        mNavDart[1][0] = cx + 9;
        mNavDart[1][1] = cy + 10;
        mNavDart[2][0] = cx;
        mNavDart[2][1] = cy + 5;
        mNavDart[3][0] = cx - 9;
        mNavDart[3][1] = cy + 10;
    }

    private function readRouteStringProp() as String? {
        try {
            var rawStr = Properties.getValue("routeString");
            if (rawStr != null && rawStr instanceof String) {
                return rawStr as String;
            }
        } catch (e) {
        }
        return null;
    }

    private function readRouteDirectionProp() as Number {
        try {
            var dirVal = Properties.getValue("routeDirection");
            if (dirVal != null) {
                if (dirVal instanceof Number) {
                    return (dirVal == 1) ? 1 : 0;
                } else if (dirVal instanceof String) {
                    return dirVal.equals("1") ? 1 : 0;
                } else if (dirVal instanceof Boolean) {
                    return dirVal ? 1 : 0;
                }
            }
        } catch (e) {
        }
        return 0;
    }

    //! Reloads and decodes the Polyline string and display options from App Settings.
    //! Preserves live navigation progress if only display/alert toggles changed.
    public function reloadRoute() as Void {
        loadDisplaySettings();

        var newRouteStr = readRouteStringProp();
        var newRouteDir = readRouteDirectionProp();
        var sameStr = (newRouteStr == null && mLoadedRouteStr == null) ||
            (newRouteStr != null && mLoadedRouteStr != null && newRouteStr.equals(mLoadedRouteStr));
        if (mHasLoadedRouteOnce && sameStr && newRouteDir == mLoadedRouteDir) {
            return;
        }

        mLoadedRouteStr = newRouteStr;
        mLoadedRouteDir = newRouteDir;
        mHasLoadedRouteOnce = true;

        loadRouteStringAndDirection();
        computeRouteBounds();
        computeCumulativeDistances();
        computeCornerAnchors();

        // Reset trail and spark ring buffers
        mTrailCount = 0;
        mTrailHead = 0;
        mLastTrailLat = 0;
        mLastTrailLon = 0;

        mSparkCount = 0;
        mSparkHead = 0;
        mLastSparkLat = 0;
        mLastSparkLon = 0;

        mHeadingHistCount = 0;
        mHeadingHistHead = 0;
        mCompassReliable = true;
        mCompassBadCount = 0;

        mGpsLostCount = 0;
        if (!mHasGps) {
            mHasEverHadGps = false;
        }
    }

    // =========================================================================
    // Settings & Route Precomputation
    // =========================================================================
    private function getBooleanProp(key as String, defaultVal as Boolean) as Boolean {
        try {
            var val = Properties.getValue(key);
            if (val != null && val instanceof Boolean) {
                return val;
            }
        } catch (e) {
        }
        return defaultVal;
    }

    private function getNumberProp(key as String, defaultVal as Number) as Number {
        try {
            var val = Properties.getValue(key);
            if (val != null && val instanceof Number) {
                return val;
            }
        } catch (e) {
        }
        return defaultVal;
    }

    private function loadRouteStringAndDirection() as Void {
        try {
            var rawStr = Properties.getValue("routeString");
            if (rawStr != null && rawStr instanceof String) {
                mPoints = PolylineDecoder.decode(rawStr as String);
                mPointCount = mPoints.size() / 2;
                mRouteStatus = PolylineDecoder.lastStatus;
                mRouteTotalPoints = PolylineDecoder.lastTotalPoints;
            } else {
                mPoints = [] as Array<Number>;
                mPointCount = 0;
                mRouteStatus = PolylineDecoder.STATUS_EMPTY;
                mRouteTotalPoints = 0;
            }
        } catch (e) {
            mPoints = [] as Array<Number>;
            mPointCount = 0;
            mRouteStatus = PolylineDecoder.STATUS_INVALID;
            mRouteTotalPoints = 0;
        }

        // Check route direction (0: Forward, 1: Reverse)
        try {
            var dirVal = Properties.getValue("routeDirection");
            var isReverse = false;
            if (dirVal != null) {
                if (dirVal instanceof Number) {
                    isReverse = (dirVal == 1);
                } else if (dirVal instanceof String) {
                    isReverse = dirVal.equals("1");
                } else if (dirVal instanceof Boolean) {
                    isReverse = dirVal;
                }
            }
            if (isReverse && mPointCount >= 2) {
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
    }

    private function loadDisplaySettings() as Void {
        var rangeVal = getNumberProp("mapRange", 175);
        mMapRange = (rangeVal >= 30) ? rangeVal.toFloat() : DEFAULT_MAP_RANGE_M;

        var cullDist = mMapRange * CULL_MARGIN_FACTOR;
        mCullDistSq = cullDist * cullDist;

        mShowDirection = getBooleanProp("showDirection", true);
        mDimCompletedPath = getBooleanProp("dimCompletedPath", true);
        mShowTurnCue = getBooleanProp("showTurnCue", true);
        mShowCornerAnchors = getBooleanProp("showCornerAnchors", true);
        mShowProgress = getBooleanProp("showProgress", true);
        mEnableVibration = getBooleanProp("enableVibration", true);
    }

    private function computeRouteBounds() as Void {
        if (mPointCount >= 2) {
            var minLa = mPoints[0];
            var maxLa = minLa;
            var minLo = mPoints[1];
            var maxLo = minLo;

            for (var i = 1; i < mPointCount; i++) {
                var idx = i * 2;
                var pLat = mPoints[idx];
                var pLon = mPoints[idx + 1];
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

            var centerLatRad = (mCenterLat.toFloat() * 0.00001f) * DEG_TO_RAD;
            mRouteCosLat = Math.cos(centerLatRad).toFloat();
            mRouteMetersPerLon = METERS_PER_MICRO_LON * mRouteCosLat;
        } else {
            mMinLat = 0;
            mMaxLat = 0;
            mMinLon = 0;
            mMaxLon = 0;
            mCenterLat = 0;
            mCenterLon = 0;
            mRouteCosLat = 1.0f;
            mRouteMetersPerLon = METERS_PER_MICRO_LON;
        }
    }

    private function computeCumulativeDistances() as Void {
        if (mPointCount >= 2) {
            mCumDist = new [mPointCount] as Array<Float>;
            mCumDist[0] = 0.0f;
            var totalMeters = 0.0f;
            var prevLat = mPoints[0];
            var prevLon = mPoints[1];

            for (var i = 1; i < mPointCount; i++) {
                var idx = i * 2;
                var currLat = mPoints[idx];
                var currLon = mPoints[idx + 1];
                var dx = (currLon - prevLon) * mRouteMetersPerLon;
                var dy = (currLat - prevLat) * METERS_PER_MICRO_LAT;
                totalMeters += Math.sqrt(dx * dx + dy * dy).toFloat();
                mCumDist[i] = totalMeters;
                prevLat = currLat;
                prevLon = currLon;
            }
            mTotalRouteMeters = totalMeters;
        } else {
            mCumDist = [] as Array<Float>;
            mTotalRouteMeters = 0.0f;
        }

        clearVisitedSegments();
        mCurrentSegmentIndex = 0;
        mCurrentSegmentProgress = 0.0f;
        mCoveredMeters = 0.0f;
        mIsCompleted = false;
        mLastVibedCornerIdx = -1;
        mTurnDist = -1;
        mTurnDirection = 0;
    }

    private function computeCornerAnchors() as Void {
        if (mPointCount >= 3) {
            var rawCorners = new [mPointCount] as Array<Number>;
            var rawAngles = new [mPointCount] as Array<Number>;
            var cornerCount = 0;

            var p0Lat = mPoints[0];
            var p0Lon = mPoints[1];
            var p1Lat = mPoints[2];
            var p1Lon = mPoints[3];
            var v1x = (p1Lon - p0Lon) * mRouteMetersPerLon;
            var v1y = (p1Lat - p0Lat) * METERS_PER_MICRO_LAT;
            var a1 = Math.atan2(v1x, v1y).toFloat();

            for (var i = 1; i < mPointCount - 1; i++) {
                var nextIdx = (i + 1) * 2;
                var p2Lat = mPoints[nextIdx];
                var p2Lon = mPoints[nextIdx + 1];

                var v2x = (p2Lon - p1Lon) * mRouteMetersPerLon;
                var v2y = (p2Lat - p1Lat) * METERS_PER_MICRO_LAT;
                var a2 = Math.atan2(v2x, v2y).toFloat();

                var diff = wrapAngleRad(a2 - a1);
                var deg = (diff * RAD_TO_DEG).toNumber();
                var absDeg = (deg < 0) ? -deg : deg;
                if (absDeg >= CORNER_MIN_ANGLE_DEG) {
                    rawCorners[cornerCount] = i;
                    rawAngles[cornerCount] = deg;
                    cornerCount++;
                }

                p1Lat = p2Lat;
                p1Lon = p2Lon;
                a1 = a2;
            }

            mCornerCount = cornerCount;
            mCornerIndices = rawCorners.slice(0, cornerCount) as Array<Number>;
            mCornerAngles = rawAngles.slice(0, cornerCount) as Array<Number>;
        } else {
            mCornerCount = 0;
            mCornerIndices = [] as Array<Number>;
            mCornerAngles = [] as Array<Number>;
        }
    }

    // =========================================================================
    // Bitfield & Math Helpers
    // =========================================================================
    private function markSegmentVisited(idx as Number) as Void {
        var word = idx >> 5; // idx / 32
        if (word >= 0 && word < mVisitedBits.size()) {
            var bit = 1 << (idx & 31);
            if ((mVisitedBits[word] & bit) == 0) {
                mVisitedBits[word] = mVisitedBits[word] | bit;
                mVisitedCount++;
            }
        }
    }

    private function isSegmentVisited(idx as Number) as Boolean {
        var word = idx >> 5; // idx / 32
        if (word >= 0 && word < mVisitedBits.size()) {
            return (mVisitedBits[word] & (1 << (idx & 31))) != 0;
        }
        return false;
    }

    private function clearVisitedSegments() as Void {
        for (var b = 0; b < mVisitedBits.size(); b++) {
            mVisitedBits[b] = 0;
        }
        mVisitedCount = 0;
    }

    //! Wraps an angle in radians into [-PI, +PI] using 32-bit Float arithmetic
    private function wrapAngleRad(diff as Float) as Float {
        while (diff > PI) {
            diff -= TWO_PI;
        }
        while (diff < -PI) {
            diff += TWO_PI;
        }
        return diff;
    }

    // =========================================================================
    // Real-Time 1 Hz Compute Loop
    // =========================================================================
    function compute(info as Activity.Info) as Void {
        // 1. Verify & update GPS location first
        if (!updateGpsLocation(info)) {
            return;
        }

        // 2. Read heading: Speed-aware dynamic heading with accumulated baseline window
        updateTargetHeading(info);

        // 3. Adaptive Dynamic Alpha Filter: Smooth straight line, instant cornering
        var angleDiff = wrapAngleRad(mTargetHeading - mRenderHeading);
        var absDiff = (angleDiff < 0.0f) ? -angleDiff : angleDiff;

        // Straight running (<15 deg): alpha = 0.12 (strong noise suppression against arm swing)
        // Corner turning (>30 deg): scale alpha up to 0.45 (zero lag response)
        var alpha = 0.12f;
        if (absDiff > 0.26f) { // > ~15 deg
            var t = (absDiff - 0.26f) / 0.70f;
            if (t > 1.0f) { t = 1.0f; }
            alpha = 0.12f + t * 0.33f;
        }

        mRenderHeading = wrapAngleRad(mRenderHeading + angleDiff * alpha);

        // 4. Record smooth trail points (every >5m)
        var dLatFromLast = (mCurrLatMicro - mLastTrailLat) * METERS_PER_MICRO_LAT;
        var dLonFromLast = (mCurrLonMicro - mLastTrailLon) * mMetersPerLon;
        var stepDistSq = dLatFromLast * dLatFromLast + dLonFromLast * dLonFromLast;
        if (stepDistSq > TRAIL_STEP_DIST_SQ || mTrailCount == 0) {
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

        // 5. Record 20-meter milestone sparks
        var dSparkLat = (mCurrLatMicro - mLastSparkLat) * METERS_PER_MICRO_LAT;
        var dSparkLon = (mCurrLonMicro - mLastSparkLon) * mMetersPerLon;
        if (dSparkLat * dSparkLat + dSparkLon * dSparkLon >= SPARK_STEP_DIST_SQ || mSparkCount == 0) {
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
            mOffCourseCount = 0;
            mTurnDist = -1;
            return;
        }

        var speed = (info has :currentSpeed) ? info.currentSpeed : null;
        mSpeedMps = (speed != null) ? speed.toFloat() : 0.0f;
        var trk = (info has :track) ? info.track : null;
        mHasNavHeading = (trk != null) || (mHeadingHistCount >= 2);

        if (speed != null && speed < 0.35f && stepDistSq < 4.0f && !mPreviewMode) {
            return;
        }

        // 6. Cross-Track Distance & Progress-Aware Forward Search Window
        var minDist = updateRouteProgressAndCrossTrack();

        // Update covered distance only while on-course so off-course detours / global fallback don't jump progress
        if (minDist <= OFF_COURSE_THRESHOLD_M && mCumDist.size() >= mPointCount) {
            var segStartD = mCumDist[mCurrentSegmentIndex];
            var segEndD = mCumDist[mCurrentSegmentIndex + 1];
            mCoveredMeters = segStartD + (segEndD - segStartD) * mCurrentSegmentProgress;
        }

        // 7. Distance & bearing to Start point (used for Preview Mode guidance)
        var dStartLonM = (mPoints[1] - mCurrLonMicro) * mMetersPerLon;
        var dStartLatM = (mPoints[0] - mCurrLatMicro) * METERS_PER_MICRO_LAT;
        mDistToStart = Math.sqrt(dStartLonM * dStartLonM + dStartLatM * dStartLatM).toNumber();
        mBearingToStart = Math.atan2(dStartLonM, dStartLatM).toFloat();

        if (minDist > PREVIEW_DIST_M) {
            mPreviewMode = true;
            mIsOffCourse = false;
            mOffCourseCount = 0;
        } else {
            mPreviewMode = false;
            checkRouteCompletion();
            if (!mIsCompleted) {
                updateOffCourseState(minDist);
            }
        }

        // 8. O(1) Upcoming Turn Cue computation (< 60m) via cumulative distance table
        updateTurnCue();
    }

    private function checkRouteCompletion() as Void {
        if (mIsCompleted || mPointCount < 2 || mTotalRouteMeters <= 0.0f) {
            return;
        }
        if (mCurrentSegmentIndex < mPointCount - 3) {
            return;
        }
        var visitedRatio = mVisitedCount.toFloat() / (mPointCount - 1).toFloat();
        if (visitedRatio < 0.70f) {
            return;
        }
        var lastIdx = (mPointCount - 1) * 2;
        var dEndLonM = (mPoints[lastIdx + 1] - mCurrLonMicro) * mMetersPerLon;
        var dEndLatM = (mPoints[lastIdx] - mCurrLatMicro) * METERS_PER_MICRO_LAT;
        if (dEndLonM * dEndLonM + dEndLatM * dEndLatM < 625.0f) { // < 25m
            mIsCompleted = true;
            mCoveredMeters = mTotalRouteMeters;
            mIsOffCourse = false;
            mOffCourseCount = 0;
            mTurnDist = -1;
            triggerHaptic(2);
        }
    }

    private function triggerHaptic(pattern as Number) as Void {
        if (!mEnableVibration || !(Attention has :vibrate)) {
            return;
        }
        if (pattern == 1) {
            var nowMs = System.getTimer();
            if (mLastOffCourseVibeMs > 0 && (nowMs - mLastOffCourseVibeMs) < 5000) {
                return;
            }
            mLastOffCourseVibeMs = nowMs;
        }
        try {
            if (pattern == 0) {
                Attention.vibrate([new Attention.VibeProfile(50, 120)]);
            } else if (pattern == 1) {
                Attention.vibrate([new Attention.VibeProfile(80, 250)]);
            } else {
                Attention.vibrate([
                    new Attention.VibeProfile(70, 200),
                    new Attention.VibeProfile(0, 120),
                    new Attention.VibeProfile(100, 350)
                ]);
            }
        } catch (e) {
        }
    }

    private function updateOffCourseState(minDist as Float) as Void {
        // Ignore poor GPS fixes (< QUALITY_USABLE) to prevent ghost off-course alerts
        if (mGpsAccuracy < GPS_QUALITY_USABLE) {
            return;
        }

        if (mIsOffCourse) {
            // Hysteresis recovery: Must return within 25m to clear off-course alert
            if (minDist <= OFF_COURSE_CLEAR_THRESHOLD_M) {
                mIsOffCourse = false;
                mOffCourseDist = 0;
                mOffCourseCount = 0;
            } else {
                mOffCourseDist = minDist.toNumber();
            }
        } else {
            // Hysteresis trigger: Must stay > 35m for 3 consecutive 1Hz samples
            if (minDist > OFF_COURSE_THRESHOLD_M) {
                mOffCourseCount++;
                if (mOffCourseCount >= 3) {
                    mIsOffCourse = true;
                    mOffCourseDist = minDist.toNumber();
                    triggerHaptic(1);
                }
            } else {
                mOffCourseCount = 0;
            }
        }
    }

    private function updateTargetHeading(info as Activity.Info) as Void {
        var speed = (info has :currentSpeed) ? info.currentSpeed : null;
        var trk = (info has :track) ? info.track : null;

        // 1. Record fresh 1Hz GPS position into heading history buffer
        mHeadingHistLat[mHeadingHistHead] = mCurrLatMicro;
        mHeadingHistLon[mHeadingHistHead] = mCurrLonMicro;
        mHeadingHistHead = (mHeadingHistHead + 1) % HEADING_HIST_CAPACITY;
        if (mHeadingHistCount < HEADING_HIST_CAPACITY) {
            mHeadingHistCount++;
        }

        // 2. Deadband: If stationary or moving very slowly (< 0.6 m/s), lock heading
        if (speed != null && speed < 0.6f) {
            return;
        }

        // 3. If running at good speed (> 1.4 m/s) and GPS Doppler track is valid, use it
        if (trk != null && (speed == null || speed > 1.4f)) {
            mTargetHeading = trk.toFloat();
            checkCompassSanity(info, mTargetHeading);
            return;
        }

        // 4. Calculate heading from accumulated baseline window (oldest vs newest in 3-4s buffer)
        // This eliminates 1-second differential jitter
        if (mHeadingHistCount >= 2) {
            var oldestIdx = (mHeadingHistHead - mHeadingHistCount + HEADING_HIST_CAPACITY) % HEADING_HIST_CAPACITY;
            var dLonM = (mCurrLonMicro - mHeadingHistLon[oldestIdx]) * mMetersPerLon;
            var dLatM = (mCurrLatMicro - mHeadingHistLat[oldestIdx]) * METERS_PER_MICRO_LAT;
            var baselineDistSq = dLonM * dLonM + dLatM * dLatM;

            // Only update heading if baseline displacement >= 3.0 meters (eliminates GPS noise)
            if (baselineDistSq >= 9.0f) {
                mTargetHeading = Math.atan2(dLonM, dLatM).toFloat();
                checkCompassSanity(info, mTargetHeading);
                return;
            }
        }

        // 5. Fallback: Electronic compass or Position heading if available
        // If compass failed sanity check against real movement, lock to current target heading
        if (!mCompassReliable) {
            return;
        }

        var ch = (info has :currentHeading) ? info.currentHeading : null;
        if (ch != null) {
            mTargetHeading = ch.toFloat();
            return;
        }

        if (trk != null) {
            mTargetHeading = trk.toFloat();
            return;
        }

        try {
            var posInfo = Position.getInfo();
            if (posInfo != null && posInfo.heading != null) {
                mTargetHeading = posInfo.heading.toFloat();
            }
        } catch (e) {
        }
    }

    private function checkCompassSanity(info as Activity.Info, groundHeading as Float) as Void {
        var ch = (info has :currentHeading) ? info.currentHeading : null;
        if (ch != null) {
            var magErr = wrapAngleRad(ch.toFloat() - groundHeading);
            if (magErr < 0.0f) { magErr = -magErr; }
            if (magErr > 0.90f) { // > ~51 degrees divergence
                if (mCompassBadCount < 6) {
                    mCompassBadCount++;
                }
                if (mCompassBadCount >= 3) {
                    mCompassReliable = false;
                }
            } else {
                if (mCompassBadCount > 0) {
                    mCompassBadCount--;
                }
                if (mCompassBadCount == 0) {
                    mCompassReliable = true;
                }
            }
        }
    }

    private function updateGpsLocation(info as Activity.Info) as Boolean {
        var acc = (info has :currentLocationAccuracy) ? info.currentLocationAccuracy : null;
        if (acc == null) {
            try {
                var posInfo = Position.getInfo();
                if (posInfo != null && posInfo has :accuracy && posInfo.accuracy != null) {
                    acc = posInfo.accuracy;
                }
            } catch (e) {
            }
        }
        if (acc != null) {
            mGpsAccuracy = acc.toNumber();
        }

        var location = (info has :currentLocation) ? info.currentLocation : null;
        if (location == null) {
            try {
                var posInfo = Position.getInfo();
                if (posInfo != null) {
                    location = posInfo.position;
                }
            } catch (e) {
            }
        }

        if (location == null) {
            handleGpsSignalLoss();
            return false;
        }

        var degrees = location.toDegrees();
        var latDeg = degrees[0].toDouble();
        var lonDeg = degrees[1].toDouble();

        if (latDeg == 0.0d && lonDeg == 0.0d) {
            handleGpsSignalLoss();
            return false;
        }

        mGpsLostCount = 0;
        mHasGps = true;
        mHasEverHadGps = true;

        var newLatMicro = (latDeg * 100000.0d).toNumber();
        var newLonMicro = (lonDeg * 100000.0d).toNumber();

        // Only recompute cos(lat) if latitude changed noticeably (> ~10m)
        var latDiff = newLatMicro - mCurrLatMicro;
        if (mCurrLatMicro == 0 || latDiff > 10 || latDiff < -10) {
            var latRad = latDeg.toFloat() * DEG_TO_RAD;
            mCosLat = Math.cos(latRad).toFloat();
            mMetersPerLon = METERS_PER_MICRO_LON * mCosLat;
        }

        mCurrLatMicro = newLatMicro;
        mCurrLonMicro = newLonMicro;
        return true;
    }

    private function handleGpsSignalLoss() as Void {
        if (mGpsLostCount < 5 && mCurrLatMicro != 0) {
            mGpsLostCount++;
        } else {
            mHasGps = false;
            mIsOffCourse = false;
            mOffCourseCount = 0;
        }
    }

    //! Evaluates nearest segment using squared distances (single sqrt at the end)
    private function updateRouteProgressAndCrossTrack() as Float {
        var maxSeg = mPointCount - 2;
        var startSearch = mCurrentSegmentIndex - 2;
        if (startSearch < 0) { startSearch = 0; }
        var endSearch = mCurrentSegmentIndex + 4;
        if (endSearch > maxSeg) { endSearch = maxSeg; }

        var minDistSq = 1.0e12f;
        var minScoreSq = 1.0e12f;
        var bestSeg = mCurrentSegmentIndex;
        var bestT = 0.0f;

        var useHeading = (mSpeedMps >= 0.8f && mHasNavHeading);
        var hx = useHeading ? Math.sin(mTargetHeading).toFloat() : 0.0f;
        var hy = useHeading ? Math.cos(mTargetHeading).toFloat() : 0.0f;

        // Pass 0: Local forward window [startSearch .. endSearch]
        // Pass 1: Full-route fallback [0 .. maxSeg] only if outside 45m snap lock
        for (var pass = 0; pass < 2; pass++) {
            var loopStart = (pass == 0) ? startSearch : 0;
            var loopEnd = (pass == 0) ? endSearch : maxSeg;

            var ax = (mPoints[loopStart * 2 + 1] - mCurrLonMicro) * mMetersPerLon;
            var ay = (mPoints[loopStart * 2] - mCurrLatMicro) * METERS_PER_MICRO_LAT;

            for (var i = loopStart; i <= loopEnd; i++) {
                var idxB = (i + 1) * 2;
                var bx = (mPoints[idxB + 1] - mCurrLonMicro) * mMetersPerLon;
                var by = (mPoints[idxB] - mCurrLatMicro) * METERS_PER_MICRO_LAT;

                if (pass == 0 || i < startSearch || i > endSearch) {
                    var vx = bx - ax;
                    var vy = by - ay;
                    var segLenSq = vx * vx + vy * vy;

                    var dSq = 0.0f;
                    var t = 0.0f;
                    if (segLenSq < 0.001f) {
                        dSq = ax * ax + ay * ay;
                    } else {
                        t = (-ax * vx - ay * vy) / segLenSq;
                        if (t < 0.0f) {
                            t = 0.0f;
                        } else if (t > 1.0f) {
                            t = 1.0f;
                        }
                        var qx = ax + t * vx;
                        var qy = ay + t * vy;
                        dSq = qx * qx + qy * qy;
                    }

                    // Continuity hysteresis: prefer current and immediate next segment
                    // against parallel/overlapping segments while keeping minDistSq exact.
                    var scoreSq = dSq;
                    if (i == mCurrentSegmentIndex || i == mCurrentSegmentIndex + 1) {
                        scoreSq = dSq * CURRENT_SEG_CONTINUITY_FACTOR;
                    }

                    // Heading-weighted penalty: penalize segments running opposite (> 90 deg)
                    if (useHeading && segLenSq >= 0.01f && scoreSq < minScoreSq + 2500.0f) {
                        var dot = hx * vx + hy * vy;
                        if (dot < 0.0f) {
                            var cosTheta = dot / Math.sqrt(segLenSq).toFloat();
                            var pen = -cosTheta * 30.0f;
                            scoreSq += pen * pen;
                        }
                    }

                    if (scoreSq < minScoreSq) {
                        minScoreSq = scoreSq;
                        minDistSq = dSq;
                        bestSeg = i;
                        bestT = t;
                    }
                }

                ax = bx;
                ay = by;
            }

            if (minDistSq <= SNAP_LOCK_DIST_SQ) {
                break;
            }
        }

        if (minDistSq <= SNAP_LOCK_DIST_SQ) {
            mCurrentSegmentIndex = bestSeg;
            mCurrentSegmentProgress = bestT;
            markSegmentVisited(bestSeg);

            // Loop-route wrap-around handling when reaching the final segment
            if (bestSeg >= maxSeg && bestT > 0.85f) {
                var hasUnvisited = false;
                for (var v = 0; v <= maxSeg; v++) {
                    if (!isSegmentVisited(v)) {
                        hasUnvisited = true;
                        break;
                    }
                }
                if (hasUnvisited) {
                    var d0x = (mPoints[1] - mCurrLonMicro) * mMetersPerLon;
                    var d0y = (mPoints[0] - mCurrLatMicro) * METERS_PER_MICRO_LAT;
                    if (d0x * d0x + d0y * d0y < 2500.0f) { // < 50m
                        mCurrentSegmentIndex = 0;
                        mCurrentSegmentProgress = 0.0f;
                    }
                }
            }
        }

        return Math.sqrt(minDistSq).toFloat();
    }

    private function updateTurnCue() as Void {
        mTurnDist = -1;
        mTurnDirection = 0;
        if (!mShowTurnCue || mIsOffCourse || mIsCompleted || mCornerCount <= 0 || mCumDist.size() < mPointCount) {
            return;
        }

        var segIdx = mCurrentSegmentIndex;
        var runnerDist = mCoveredMeters;
        if (runnerDist <= 0.0f && segIdx < mCumDist.size() - 1) {
            var segStartD = mCumDist[segIdx];
            var segEndD = mCumDist[segIdx + 1];
            runnerDist = segStartD + (segEndD - segStartD) * mCurrentSegmentProgress;
        }

        for (var c = 0; c < mCornerCount; c++) {
            var cornerIdx = mCornerIndices[c];
            if (cornerIdx > segIdx) {
                var distAhead = mCumDist[cornerIdx] - runnerDist;
                if (distAhead >= 0.0f && distAhead <= TURN_CUE_MAX_DIST_M) {
                    mTurnDist = distAhead.toNumber();
                    mTurnDirection = (mCornerAngles[c] > 0) ? 1 : -1;
                    if (mTurnDist <= 20 && cornerIdx != mLastVibedCornerIdx) {
                        mLastVibedCornerIdx = cornerIdx;
                        triggerHaptic(0);
                    }
                }
                break;
            }
        }
    }

    // =========================================================================
    // Rendering Pipeline (1 Hz AMOLED Vector Renderer)
    // =========================================================================
    function onUpdate(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        updateLayoutCache(w, h);
        var cx = mCenterX;
        var cy = mCenterY;

        // 1. Pure black AMOLED background
        dc.setColor(COLOR_BLACK, COLOR_BLACK);
        dc.clear();

        // 2. No route configured: free-trail exploration mode
        // Renders firefly trail, sparks, and runner cursor in heading-up mode,
        // without route lines, with a "NO ROUTE" capsule badge.
        if (mPointCount < 2) {
            var heading = mRenderHeading;
            var sinH = Math.sin(heading).toFloat();
            var cosH = Math.cos(heading).toFloat();
            var zoomScale = cx.toFloat() / mMapRange;

            renderFireflyTrail(dc, cx, cy, sinH, cosH, zoomScale);
            renderSparks(dc, cx, cy, sinH, cosH, zoomScale);
            renderRunnerCursor(dc, cx, cy);
            renderNoRouteCapsule(dc, cx, h);

            if (!mHasGps) {
                dc.setColor(Graphics.COLOR_YELLOW, Graphics.COLOR_TRANSPARENT);
                var gpsMsg = mHasEverHadGps ? "SEARCHING GPS..." : "WAITING FOR GPS...";
                dc.drawText(cx, (h * 0.85f).toNumber(), Graphics.FONT_XTINY, gpsMsg, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            }
            return;
        }

        // 3. Waiting for GPS OR Far-Away Route Preview
        if (!mHasGps || mPreviewMode) {
            PreviewRenderer.render(dc, self);
            if (mRouteStatus == PolylineDecoder.STATUS_TRUNCATED) {
                renderTruncatedBanner(dc, cx);
            }
            return;
        }

        // 4. Heading-Up projection parameters
        var heading = mRenderHeading;
        var sinH = Math.sin(heading).toFloat();
        var cosH = Math.cos(heading).toFloat();
        var zoomScale = cx.toFloat() / mMapRange;

        // 5. Layered vector rendering pipeline
        renderRouteGeometry(dc, cx, cy, w, h, sinH, cosH, zoomScale);
        renderCornerAnchors(dc, cx, cy, w, h, sinH, cosH, zoomScale);
        renderFireflyTrail(dc, cx, cy, sinH, cosH, zoomScale);
        renderSparks(dc, cx, cy, sinH, cosH, zoomScale);
        renderRunnerCursor(dc, cx, cy);
        renderAlertBanners(dc, cx);
        if (mShowProgress && mTotalRouteMeters > 0.0f) {
            renderProgressPill(dc, cx, h);
        }
    }

    private function renderRouteGeometry(dc as Graphics.Dc, cx as Number, cy as Number, w as Number, h as Number, sinH as Float, cosH as Float, zoomScale as Float) as Void {
        var numSegs = mPointCount - 1;
        var hasCumDist = (mShowDirection && mCumDist.size() >= mPointCount);

        // Pre-calculate first vertex metric offset to avoid duplicate transforms per segment
        var ax = (mPoints[1] - mCurrLonMicro) * mMetersPerLon;
        var ay = (mPoints[0] - mCurrLatMicro) * METERS_PER_MICRO_LAT;
        var aDistSq = ax * ax + ay * ay;
        var sx1 = 0.0f;
        var sy1 = 0.0f;
        var hasPrevScreenPt = false;

        for (var i = 0; i < numSegs; i++) {
            var idxB = (i + 1) * 2;
            var bx = (mPoints[idxB + 1] - mCurrLonMicro) * mMetersPerLon;
            var by = (mPoints[idxB] - mCurrLatMicro) * METERS_PER_MICRO_LAT;
            var bDistSq = bx * bx + by * by;

            var isCurrent = (i == mCurrentSegmentIndex);

            // Viewport culling (never cull the active segment)
            if (!isCurrent && aDistSq > mCullDistSq && bDistSq > mCullDistSq) {
                ax = bx;
                ay = by;
                aDistSq = bDistSq;
                hasPrevScreenPt = false;
                continue;
            }

            if (!hasPrevScreenPt) {
                sx1 = cx + (ax * cosH - ay * sinH) * zoomScale;
                sy1 = cy - (ay * cosH + ax * sinH) * zoomScale;
            }
            var sx2 = cx + (bx * cosH - by * sinH) * zoomScale;
            var sy2 = cy - (by * cosH + bx * sinH) * zoomScale;

            var is1x = sx1.toNumber();
            var is1y = sy1.toNumber();
            var is2x = sx2.toNumber();
            var is2y = sy2.toNumber();

            var isVisited = isSegmentVisited(i);

            if (mDimCompletedPath && isVisited && !isCurrent) {
                dc.setColor(COLOR_DIMMED_CYAN, Graphics.COLOR_TRANSPARENT);
                dc.setPenWidth(3);
                dc.drawLine(is1x, is1y, is2x, is2y);
            } else if (mDimCompletedPath && isCurrent) {
                var t = mCurrentSegmentProgress;
                var midX = (sx1 + (sx2 - sx1) * t).toNumber();
                var midY = (sy1 + (sy2 - sy1) * t).toNumber();

                dc.setColor(COLOR_DIMMED_CYAN, Graphics.COLOR_TRANSPARENT);
                dc.setPenWidth(3);
                dc.drawLine(is1x, is1y, midX, midY);

                dc.setColor(COLOR_CYAN, Graphics.COLOR_TRANSPARENT);
                dc.setPenWidth(4);
                dc.drawLine(midX, midY, is2x, is2y);

                if (!hasPrevScreenPt) {
                    dc.setColor(COLOR_DIMMED_CYAN, COLOR_DIMMED_CYAN);
                    dc.fillCircle(is1x, is1y, 2);
                }
                dc.setColor(COLOR_CYAN, COLOR_CYAN);
                dc.fillCircle(is2x, is2y, 2);
            } else {
                dc.setColor(COLOR_CYAN, Graphics.COLOR_TRANSPARENT);
                dc.setPenWidth(4);
                dc.drawLine(is1x, is1y, is2x, is2y);

                dc.setColor(COLOR_CYAN, COLOR_CYAN);
                if (!hasPrevScreenPt) {
                    dc.fillCircle(is1x, is1y, 2);
                }
                dc.fillCircle(is2x, is2y, 2);
            }

            // Directional chevrons (50m minor / 250m major)
            if (hasCumDist) {
                renderSegmentChevrons(dc, i, w, h, sx1, sy1, sx2, sy2, isVisited, isCurrent);
            }

            ax = bx;
            ay = by;
            aDistSq = bDistSq;
            sx1 = sx2;
            sy1 = sy2;
            hasPrevScreenPt = true;
        }
    }

    private function renderSegmentChevrons(
        dc as Graphics.Dc,
        segIdx as Number,
        w as Number,
        h as Number,
        sx1 as Float,
        sy1 as Float,
        sx2 as Float,
        sy2 as Float,
        isVisited as Boolean,
        isCurrent as Boolean
    ) as Void {
        var startD = mCumDist[segIdx];
        var endD = mCumDist[segIdx + 1];
        var segLenM = endD - startD;
        if (segLenM < 1.0f) {
            return;
        }

        var kStart = (startD / 50.0f).toNumber() + 1;
        var curTarget = kStart * 50.0f;
        if (curTarget >= endD) {
            return;
        }

        var sDx = sx2 - sx1;
        var sDy = sy2 - sy1;
        var sLen = Math.sqrt(sDx * sDx + sDy * sDy).toFloat();
        if (sLen <= 2.0f) {
            return;
        }

        var sux = sDx / sLen;
        var suy = sDy / sLen;
        var snx = -suy;
        var sny = sux;

        while (curTarget < endD) {
            var ct = (curTarget - startD) / segLenM;
            var csx = sx1 + ct * sDx;
            var csy = sy1 + ct * sDy;

            if (csx >= -25.0f && csx <= w + 25 && csy >= -25.0f && csy <= h + 25) {
                var isChevronPassed = (segIdx < mCurrentSegmentIndex)
                    || (isVisited && !isCurrent)
                    || (isCurrent && ct <= mCurrentSegmentProgress);
                var isDimmed = (mDimCompletedPath && isChevronPassed);
                var isMajor = ((kStart % 5) == 0);

                dc.setColor(isDimmed ? COLOR_DIMMED_CYAN : COLOR_CYAN, Graphics.COLOR_TRANSPARENT);
                dc.setPenWidth(isMajor ? (isDimmed ? 2 : 4) : (isDimmed ? 1 : 2));

                var fwdLen = isMajor ? 9.0f : 5.0f;
                var backLen = isMajor ? 6.0f : 3.0f;
                var wingSpan = isMajor ? 10.0f : 5.0f;

                var tipX = (csx + sux * fwdLen).toNumber();
                var tipY = (csy + suy * fwdLen).toNumber();
                var baseX = csx - sux * backLen;
                var baseY = csy - suy * backLen;
                var wingX = snx * wingSpan;
                var wingY = sny * wingSpan;
                dc.drawLine((baseX + wingX).toNumber(), (baseY + wingY).toNumber(), tipX, tipY);
                dc.drawLine((baseX - wingX).toNumber(), (baseY - wingY).toNumber(), tipX, tipY);
            }
            kStart++;
            curTarget = kStart * 50.0f;
        }
    }

    private function renderCornerAnchors(dc as Graphics.Dc, cx as Number, cy as Number, w as Number, h as Number, sinH as Float, cosH as Float, zoomScale as Float) as Void {
        if (!mShowCornerAnchors || mCornerCount <= 0) {
            return;
        }

        for (var c = 0; c < mCornerCount; c++) {
            var cPointIdx = mCornerIndices[c];
            var idx = cPointIdx * 2;

            var ax = (mPoints[idx + 1] - mCurrLonMicro) * mMetersPerLon;
            var ay = (mPoints[idx] - mCurrLatMicro) * METERS_PER_MICRO_LAT;

            if (ax * ax + ay * ay > mCullDistSq) {
                continue;
            }

            var sx = (cx + (ax * cosH - ay * sinH) * zoomScale).toNumber();
            var sy = (cy - (ay * cosH + ax * sinH) * zoomScale).toNumber();

            if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) {
                continue;
            }

            if (mDimCompletedPath && isSegmentVisited(cPointIdx)) {
                dc.setColor(COLOR_DIMMED_CYAN, COLOR_DIMMED_CYAN);
                dc.fillCircle(sx, sy, 3);
            } else {
                dc.setColor(COLOR_DIMMED_CYAN, COLOR_DIMMED_CYAN);
                dc.fillCircle(sx, sy, 6);
                dc.setColor(COLOR_CYAN, COLOR_CYAN);
                dc.fillCircle(sx, sy, 3);
                dc.setColor(COLOR_WHITE, COLOR_WHITE);
                dc.fillCircle(sx, sy, 1);
            }
        }
    }

    private function renderFireflyTrail(dc as Graphics.Dc, cx as Number, cy as Number, sinH as Float, cosH as Float, zoomScale as Float) as Void {
        if (mTrailCount <= 1) {
            return;
        }

        var startIdx = (mTrailHead - mTrailCount + TRAIL_CAPACITY) % TRAIL_CAPACITY;
        var numSegs = mTrailCount - 1;

        dc.setColor(COLOR_LIME, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(3);

        var p1Idx = startIdx * 2;
        var tax1 = (mTrailPoints[p1Idx + 1] - mCurrLonMicro) * mMetersPerLon;
        var tay1 = (mTrailPoints[p1Idx] - mCurrLatMicro) * METERS_PER_MICRO_LAT;
        var t1DistSq = tax1 * tax1 + tay1 * tay1;
        var tsx1 = (cx + (tax1 * cosH - tay1 * sinH) * zoomScale).toNumber();
        var tsy1 = (cy - (tay1 * cosH + tax1 * sinH) * zoomScale).toNumber();

        for (var t = 0; t < numSegs; t++) {
            var p2Idx = ((startIdx + t + 1) % TRAIL_CAPACITY) * 2;
            var tax2 = (mTrailPoints[p2Idx + 1] - mCurrLonMicro) * mMetersPerLon;
            var tay2 = (mTrailPoints[p2Idx] - mCurrLatMicro) * METERS_PER_MICRO_LAT;
            var t2DistSq = tax2 * tax2 + tay2 * tay2;

            var tsx2 = (cx + (tax2 * cosH - tay2 * sinH) * zoomScale).toNumber();
            var tsy2 = (cy - (tay2 * cosH + tax2 * sinH) * zoomScale).toNumber();

            if (t1DistSq <= mCullDistSq || t2DistSq <= mCullDistSq) {
                dc.drawLine(tsx1, tsy1, tsx2, tsy2);
            }

            t1DistSq = t2DistSq;
            tsx1 = tsx2;
            tsy1 = tsy2;
        }

        // Connect newest trail point smoothly to the runner's tail
        dc.drawLine(tsx1, tsy1, cx, cy + 4);
    }

    private function renderSparks(dc as Graphics.Dc, cx as Number, cy as Number, sinH as Float, cosH as Float, zoomScale as Float) as Void {
        if (mSparkCount <= 0) {
            return;
        }

        var sparkStartIdx = (mSparkHead - mSparkCount + SPARK_CAPACITY) % SPARK_CAPACITY;
        var invSparkCount = 1.0f / mSparkCount.toFloat();

        for (var s = 0; s < mSparkCount; s++) {
            var spIdx = ((sparkStartIdx + s) % SPARK_CAPACITY) * 2;
            var sax = (mSparkPoints[spIdx + 1] - mCurrLonMicro) * mMetersPerLon;
            var say = (mSparkPoints[spIdx] - mCurrLatMicro) * METERS_PER_MICRO_LAT;

            if (sax * sax + say * say <= mCullDistSq) {
                var ssx = (cx + (sax * cosH - say * sinH) * zoomScale).toNumber();
                var ssy = (cy - (say * cosH + sax * sinH) * zoomScale).toNumber();

                var sparkRatio = (s + 1).toFloat() * invSparkCount;

                if (sparkRatio < 0.35f) {
                    dc.setColor(COLOR_LIME_FAINT, COLOR_LIME_FAINT);
                    dc.fillCircle(ssx, ssy, 2);
                } else if (sparkRatio < 0.70f) {
                    dc.setColor(COLOR_LIME_MID, COLOR_LIME_MID);
                    dc.fillCircle(ssx, ssy, 3);
                    dc.setColor(COLOR_WHITE, COLOR_WHITE);
                    dc.fillCircle(ssx, ssy, 1);
                } else {
                    dc.setColor(COLOR_LIME, COLOR_LIME);
                    dc.fillCircle(ssx, ssy, 4);
                    dc.setColor(COLOR_WHITE, COLOR_WHITE);
                    dc.fillCircle(ssx, ssy, 2);
                }
            }
        }
    }

    private function renderRunnerCursor(dc as Graphics.Dc, cx as Number, cy as Number) as Void {
        dc.setColor(COLOR_LIME, COLOR_LIME);
        dc.fillPolygon(mNavDart);

        dc.setColor(COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(2);
        dc.drawLine(cx, cy - 14, cx + 9, cy + 10);
        dc.drawLine(cx + 9, cy + 10, cx, cy + 5);
        dc.drawLine(cx, cy + 5, cx - 9, cy + 10);
        dc.drawLine(cx - 9, cy + 10, cx, cy - 14);

        dc.setColor(COLOR_WHITE, COLOR_WHITE);
        dc.fillCircle(cx, cy - 1, 3);
    }

    private function renderAlertBanners(dc as Graphics.Dc, cx as Number) as Void {
        if (mIsOffCourse) {
            var bannerW = 210;
            var bannerH = 34;
            var bannerX = cx - (bannerW / 2);
            var bannerY = 36;

            dc.setColor(COLOR_ALERT, COLOR_ALERT);
            dc.fillRoundedRectangle(bannerX, bannerY, bannerW, bannerH, 6);

            dc.setColor(COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, bannerY + (bannerH / 2), Graphics.FONT_XTINY, "OFF COURSE (+" + mOffCourseDist + "m)", Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            return;
        }

        if (mIsCompleted) {
            PreviewRenderer.drawPillCapsule(
                dc,
                cx,
                46,
                Graphics.FONT_XTINY,
                "COMPLETED!",
                22,
                COLOR_BADGE_BG,
                COLOR_LIME,
                COLOR_LIME
            );
            return;
        }

        if (mShowTurnCue && mTurnDist >= 0 && mTurnDist <= 60) {
            var badgeW = 144;
            var badgeH = 36;
            var badgeX = cx - (badgeW / 2);
            var badgeY = 36;

            var isImminent = (mTurnDist <= 20);
            var bgColor = isImminent ? COLOR_AMBER_BG : COLOR_BADGE_BG;
            var borderColor = isImminent ? COLOR_AMBER_BORDER : COLOR_BADGE_BORDER;

            dc.setColor(bgColor, bgColor);
            dc.fillRoundedRectangle(badgeX, badgeY, badgeW, badgeH, 8);
            dc.setColor(borderColor, Graphics.COLOR_TRANSPARENT);
            dc.setPenWidth(3);
            dc.drawRoundedRectangle(badgeX, badgeY, badgeW, badgeH, 8);

            dc.setColor(COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.setPenWidth(3);

            var arrowCornerY = badgeY + 11;
            var arrowStemY = badgeY + 25;
            var isRight = (mTurnDirection > 0);
            var arrowStemX = badgeX + (isRight ? 16 : 36);
            var arrowHeadX = badgeX + (isRight ? 36 : 16);
            var tipDir = isRight ? -6 : 6;

            dc.drawLine(arrowStemX, arrowStemY, arrowStemX, arrowCornerY);
            dc.drawLine(arrowStemX, arrowCornerY, arrowHeadX, arrowCornerY);
            dc.drawLine(arrowHeadX, arrowCornerY, arrowHeadX + tipDir, arrowCornerY - 6);
            dc.drawLine(arrowHeadX, arrowCornerY, arrowHeadX + tipDir, arrowCornerY + 6);

            dc.drawText(badgeX + 48, badgeY + (badgeH / 2), Graphics.FONT_TINY, mTurnDist + "m", Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
            return;
        }

        if (mRouteStatus == PolylineDecoder.STATUS_TRUNCATED) {
            renderTruncatedBanner(dc, cx);
        }
    }

    private function renderTruncatedBanner(dc as Graphics.Dc, cx as Number) as Void {
        var warnStr = "TRUNCATED " + PolylineDecoder.MAX_POINTS + "/" + mRouteTotalPoints;
        PreviewRenderer.drawPillCapsule(
            dc,
            cx,
            40,
            Graphics.FONT_XTINY,
            warnStr,
            18,
            0x78350F,
            COLOR_AMBER_BORDER,
            0xFDE68A
        );
    }

    private function renderProgressPill(dc as Graphics.Dc, cx as Number, h as Number) as Void {
        var remMeters = mIsCompleted ? 0.0f : (mTotalRouteMeters - mCoveredMeters);
        if (remMeters < 0.0f) { remMeters = 0.0f; }

        var pct = mIsCompleted ? 100 : ((mCoveredMeters / mTotalRouteMeters) * 100.0f).toNumber();
        if (pct < 0) { pct = 0; }
        if (pct > 100) { pct = 100; }

        var hudText = PreviewRenderer.formatDistance(remMeters) + " | " + pct + "%";
        var pillY = (h < 240) ? (h - 20) : (h * 0.87f).toNumber();
        PreviewRenderer.drawPillCapsule(
            dc,
            cx,
            pillY,
            Graphics.FONT_XTINY,
            hudText,
            20,
            COLOR_BADGE_BG,
            mIsCompleted ? COLOR_LIME : COLOR_BADGE_BORDER,
            mIsCompleted ? COLOR_LIME : COLOR_WHITE
        );
    }

    private function renderNoRouteCapsule(dc as Graphics.Dc, cx as Number, h as Number) as Void {
        var isInvalid = (mRouteStatus == PolylineDecoder.STATUS_INVALID);
        PreviewRenderer.drawPillCapsule(
            dc,
            cx,
            (h * 0.14f).toNumber(),
            Graphics.FONT_XTINY,
            isInvalid ? "INVALID ROUTE" : "NO ROUTE",
            20,
            isInvalid ? 0x450A0A : 0x041C24,
            isInvalid ? 0xEF4444 : COLOR_CYAN,
            isInvalid ? 0xFCA5A5 : COLOR_CYAN
        );
    }

    // =========================================================================
    // Unit Testing Hooks
    // =========================================================================
    public function setRouteForTesting(pts as Array<Number>) as Void {
        mPoints = pts;
        mPointCount = pts.size() / 2;
        if (mPointCount >= 2) {
            computeRouteBounds();
            computeCumulativeDistances();
            computeCornerAnchors();
        }
    }

    public function simulateLocation(latMicro as Number, lonMicro as Number, headingRad as Float, isFar as Boolean) as Void {
        mHasGps = true;
        mHasEverHadGps = true;
        mGpsAccuracy = GPS_QUALITY_USABLE;
        mCurrLatMicro = latMicro;
        mCurrLonMicro = lonMicro;
        mRenderHeading = headingRad;
        mPreviewMode = isFar;
        if (mPointCount >= 2) {
            var dStartLonM = (mPoints[1] - mCurrLonMicro) * mMetersPerLon;
            var dStartLatM = (mPoints[0] - mCurrLatMicro) * METERS_PER_MICRO_LAT;
            mDistToStart = Math.sqrt(dStartLonM * dStartLonM + dStartLatM * dStartLatM).toNumber();
            mBearingToStart = Math.atan2(dStartLonM, dStartLatM).toFloat();
        }
    }

    public function isOffCourse() as Boolean {
        return mIsOffCourse;
    }

    public function setGpsAccuracyForTesting(acc as Number) as Void {
        mGpsAccuracy = acc;
    }

    public function updateOffCourseForTesting(minDist as Float) as Void {
        updateOffCourseState(minDist);
    }

    public function updateProgressForTesting() as Float {
        var d = updateRouteProgressAndCrossTrack();
        if (mCumDist.size() >= mPointCount && mCurrentSegmentIndex + 1 < mCumDist.size()) {
            var segStartD = mCumDist[mCurrentSegmentIndex];
            var segEndD = mCumDist[mCurrentSegmentIndex + 1];
            mCoveredMeters = segStartD + (segEndD - segStartD) * mCurrentSegmentProgress;
        }
        return d;
    }

    public function getCurrentSegmentIndexForTesting() as Number {
        return mCurrentSegmentIndex;
    }

    public function getCurrentSegmentProgressForTesting() as Float {
        return mCurrentSegmentProgress;
    }

    public function getTotalRouteMetersForTesting() as Float {
        return mTotalRouteMeters;
    }

    public function getCornerCountForTesting() as Number {
        return mCornerCount;
    }

    public function setNavHeadingForTesting(headingRad as Float, speedMps as Float) as Void {
        mTargetHeading = headingRad;
        mSpeedMps = speedMps;
        mHasNavHeading = true;
    }

    public function checkCompletionForTesting() as Boolean {
        checkRouteCompletion();
        return mIsCompleted;
    }

    public function updateTurnCueForTesting() as Void {
        updateTurnCue();
    }

    public function getTurnDistForTesting() as Number {
        return mTurnDist;
    }

    public function getTurnDirectionForTesting() as Number {
        return mTurnDirection;
    }

    public function getCoveredMetersForTesting() as Float {
        return mCoveredMeters;
    }
}
