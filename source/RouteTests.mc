import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Test;

//! Automated regression tests for He-Kim-Koo navigation & decoding logic.
//! Compiled only when passing `-t` to monkeyc; stripped from release builds.

(:test)
function testLoadRoute(logger as Toybox.Test.Logger) as Boolean {
    var rawStr = "{~wCskwdVuAFsACH}G@FqACmA@q@As@ABwDCvDKAJ@r@@p@@MrGeACO?S?kAA}@AgBCeBGF@KhEY?q@CgAA?FDoEaALaBCADc@AK@?OIrMcAEuJI}F{Sn@iCzCkCDAlAQr@Ax@CrBDN@tAJ|A?B?BDf@?JUJCTE@?FD~C{ELH|H{Kd@]~Aq@NYLCdAQBLf@Ap@??OL?G}Aj@SOa@ECAA?cCrBaFLc@Fe@FAD?F@r@wAF@?yBKjc@sA?iAAEAG|HfC@R?DCD@EAEBJhAI?EvO";
    var pts = PolylineDecoder.decode(rawStr);
    logger.debug("Decoded point count: " + (pts.size() / 2));
    var field = new RouteDataField();
    field.setRouteForTesting(pts);

    var bb = Graphics.createBufferedBitmap({:width => 416, :height => 416});
    var dc = bb.get().getDc();

    field.onUpdate(dc);
    field.simulateLocation(2500000, 12150000, 0.5f, true);
    field.onUpdate(dc);
    field.simulateLocation(2506270, 12153034, 1.2f, true);
    field.onUpdate(dc);
    field.simulateLocation(2506270, 12153034, 0.0f, false);
    field.onUpdate(dc);
    field.setRouteForTesting([]);
    field.onUpdate(dc);

    field.setRouteForTesting(pts);
    field.setGpsAccuracyForTesting(3);

    field.updateOffCourseForTesting(40.0f);
    Test.assertEqual(field.isOffCourse(), false);
    field.updateOffCourseForTesting(42.0f);
    Test.assertEqual(field.isOffCourse(), false);
    field.updateOffCourseForTesting(10.0f);
    Test.assertEqual(field.isOffCourse(), false);

    field.updateOffCourseForTesting(38.0f);
    field.updateOffCourseForTesting(39.0f);
    field.updateOffCourseForTesting(41.0f);
    Test.assertEqual(field.isOffCourse(), true);

    field.updateOffCourseForTesting(30.0f);
    Test.assertEqual(field.isOffCourse(), true);
    field.updateOffCourseForTesting(22.0f);
    Test.assertEqual(field.isOffCourse(), false);

    field.setGpsAccuracyForTesting(2);
    field.updateOffCourseForTesting(50.0f);
    field.updateOffCourseForTesting(50.0f);
    field.updateOffCourseForTesting(50.0f);
    Test.assertEqual(field.isOffCourse(), false);

    logger.debug("testLoadRoute passed.");
    return true;
}

(:test)
function testContinuityHysteresis(logger as Toybox.Test.Logger) as Boolean {
    var field = new RouteDataField();

    // Parallel U-shape route around lat 25.00000, lon 121.50000:
    // Seg 0: (2500000, 12150000) -> (2500000, 12150100) [East ~101m]
    // Seg 1: (2500000, 12150100) -> (2500010, 12150100) [North ~11.1m]
    // Seg 2: (2500010, 12150100) -> (2500010, 12150000) [West ~101m, parallel 11.1m north of Seg 0]
    var pts = [
        2500000, 12150000,
        2500000, 12150100,
        2500010, 12150100,
        2500010, 12150000
    ] as Array<Number>;
    field.setRouteForTesting(pts);

    // 1. Runner starts on Seg 0 (midpoint)
    field.simulateLocation(2500000, 12150050, 1.57f, false);
    var d0 = field.updateProgressForTesting();
    Test.assertEqual(field.getCurrentSegmentIndexForTesting(), 0);
    Test.assert(d0 < 1.0f);

    // 2. GPS jitter: 2500006 is ~6.67m from Seg 0 and ~4.45m from parallel Seg 2.
    // With 0.64 continuity factor on Seg 0:
    // Seg 0 score = 6.67^2 * 0.64 = 28.47; Seg 2 score = 4.45^2 = 19.80 -> wait:
    // At 2500005.3 (5.89m from Seg 0, 5.22m from Seg 2):
    // Seg 0 score = 34.69 * 0.64 = 22.20 < Seg 2 score = 27.25 -> stays on Seg 0!
    // Use integer microdegrees: 2500005 (~5.56m from Seg 0, ~5.56m from Seg 2)
    // Even if slightly biased: let's make Seg 2 at 2500010, test 2500005 (exact 5.56m)
    // and 2500005 vs 2500010: let's use 2500020 for Seg 2 (~22.2m north) and test at 2500010?
    // Better: Seg 2 at 2500011 (~12.2m north). At 2500006:
    // dist(Seg 0) = 6.67m (score = 44.49 * 0.64 = 28.47), dist(Seg 2) = 5.56m (score = 30.91).
    var pts2 = [
        2500000, 12150000,
        2500000, 12150100,
        2500011, 12150100,
        2500011, 12150000
    ] as Array<Number>;
    field.setRouteForTesting(pts2);
    field.simulateLocation(2500000, 12150050, 1.57f, false);
    field.updateProgressForTesting();
    Test.assertEqual(field.getCurrentSegmentIndexForTesting(), 0);

    // Jitter closer to Seg 2 (5.56m vs 6.67m): continuity keeps lock on Seg 0
    field.simulateLocation(2500006, 12150050, 1.57f, false);
    var dJitter = field.updateProgressForTesting();
    Test.assertEqual(field.getCurrentSegmentIndexForTesting(), 0);
    // Exact geometric distance to Seg 0 (~6.67m) must still be reported accurately
    Test.assert(dJitter > 6.0f && dJitter < 7.5f);

    // 3. Normal forward progression to Seg 1 (next segment)
    field.simulateLocation(2500005, 12150100, 0.0f, false);
    var dNext = field.updateProgressForTesting();
    Test.assertEqual(field.getCurrentSegmentIndexForTesting(), 1);
    Test.assert(dNext < 1.0f);

    logger.debug("testContinuityHysteresis passed.");
    return true;
}

(:test)
function testPolylineDecoderEdgeCases(logger as Toybox.Test.Logger) as Boolean {
    // 1. Null & empty strings
    Test.assertEqual(PolylineDecoder.decode(null).size(), 0);
    Test.assertEqual(PolylineDecoder.decode("").size(), 0);

    // 2. Truncated tail (incomplete coordinate pair) should safely drop incomplete point
    var valid = "_p~iF~ps|U_ulLnnqC_mqNvxq`@"; // 3 points
    var fullPts = PolylineDecoder.decode(valid);
    Test.assertEqual(fullPts.size(), 6);

    var truncatedTail = valid.substring(0, valid.length() - 2);
    var partialPts = PolylineDecoder.decode(truncatedTail);
    Test.assertEqual(partialPts.size(), 4); // 2 complete points

    // 3. Enforce MAX_POINTS (150) cap & TRUNCATED status
    var longStr = "";
    for (var i = 0; i < 160; i++) {
        longStr += "??"; // delta (0, 0)
    }
    var cappedPts = PolylineDecoder.decode(longStr);
    Test.assertEqual(cappedPts.size(), PolylineDecoder.MAX_POINTS * 2);
    Test.assertEqual(PolylineDecoder.lastStatus, PolylineDecoder.STATUS_TRUNCATED);
    Test.assertEqual(PolylineDecoder.lastTotalPoints, 160);

    // 4. Invalid ASCII character & STATUS_INVALID
    var invalidPts = PolylineDecoder.decode("invalid space!");
    Test.assertEqual(invalidPts.size(), 0);
    Test.assertEqual(PolylineDecoder.lastStatus, PolylineDecoder.STATUS_INVALID);

    logger.debug("testPolylineDecoderEdgeCases passed.");
    return true;
}

(:test)
function testHeadingWeightedSearch(logger as Toybox.Test.Logger) as Boolean {
    var field = new RouteDataField();
    // Seg 0: South -> North along lon 121.50000
    // Seg 1: North -> East
    // Seg 2: North -> South along lon 121.50010 (~10m east of Seg 0)
    var pts = [
        2500000, 12150000,
        2500200, 12150000,
        2500200, 12150010,
        2500000, 12150010
    ] as Array<Number>;
    field.setRouteForTesting(pts);

    // Runner is moving North (heading = 0.0 rad, speed = 3.0 m/s)
    // Positioned at lon 12150006 (~6m from Seg 0, ~4m from opposite Seg 2)
    // Without heading penalty, Pass 0 could snap to Seg 2; with heading penalty, Seg 0 wins!
    field.simulateLocation(2500100, 12150006, 0.0f, false);
    field.setNavHeadingForTesting(0.0f, 3.0f);
    field.updateProgressForTesting();
    Test.assertEqual(field.getCurrentSegmentIndexForTesting(), 0);

    logger.debug("testHeadingWeightedSearch passed.");
    return true;
}

(:test)
function testRouteCompletionClosedLoop(logger as Toybox.Test.Logger) as Boolean {
    var field = new RouteDataField();
    // Closed square loop: start == end at (2500000, 12150000)
    var pts = [
        2500000, 12150000,
        2500100, 12150000,
        2500100, 12150100,
        2500000, 12150100,
        2500000, 12150000
    ] as Array<Number>;
    field.setRouteForTesting(pts);

    // 1. At start (near end coordinate too): must NOT falsely complete
    field.simulateLocation(2500005, 12150000, 0.0f, false);
    field.updateProgressForTesting();
    Test.assertEqual(field.checkCompletionForTesting(), false);

    // 2. Visit segments 1, 2, 3 and arrive within 25m of endpoint on final segment
    field.simulateLocation(2500100, 12150050, 1.57f, false);
    field.updateProgressForTesting();
    field.simulateLocation(2500050, 12150100, 3.14f, false);
    field.updateProgressForTesting();
    field.simulateLocation(2500000, 12150050, -1.57f, false);
    field.updateProgressForTesting();
    field.simulateLocation(2500000, 12150010, -1.57f, false);
    field.updateProgressForTesting();
    Test.assertEqual(field.checkCompletionForTesting(), true);

    logger.debug("testRouteCompletionClosedLoop passed.");
    return true;
}

(:test)
function testCornerAnchorPrecomputation(logger as Toybox.Test.Logger) as Boolean {
    var field = new RouteDataField();
    // L-shape 90-degree turn: East then North
    var pts = [
        2500000, 12150000,
        2500000, 12150100,
        2500100, 12150100
    ] as Array<Number>;
    field.setRouteForTesting(pts);
    Test.assertEqual(field.getCornerCountForTesting(), 1);
    Test.assert(field.getTotalRouteMetersForTesting() > 180.0f);

    logger.debug("testCornerAnchorPrecomputation passed.");
    return true;
}

(:test)
function testTurnCueApproachAndDirection(logger as Toybox.Test.Logger) as Boolean {
    var field = new RouteDataField();
    // L-shape East -> North (~101m East, ~111m North)
    var ptsLeft = [
        2500000, 12150000,
        2500000, 12150100,
        2500100, 12150100
    ] as Array<Number>;
    field.setRouteForTesting(ptsLeft);

    // 1. Far from corner (~81m away): turn cue must be inactive (-1)
    field.simulateLocation(2500000, 12150020, 1.57f, false);
    field.updateProgressForTesting();
    field.updateTurnCueForTesting();
    Test.assertEqual(field.getTurnDistForTesting(), -1);
    Test.assertEqual(field.getTurnDirectionForTesting(), 0);

    // 2. Within 50m of corner (~25m away): turn cue active
    field.simulateLocation(2500000, 12150075, 1.57f, false);
    field.updateProgressForTesting();
    field.updateTurnCueForTesting();
    var leftDist = field.getTurnDistForTesting();
    var leftDir = field.getTurnDirectionForTesting();
    Test.assert(leftDist > 0 && leftDist <= 50);
    Test.assert(leftDir != 0);

    // 3. Opposite turn (East -> South): direction sign must flip
    var fieldRight = new RouteDataField();
    var ptsRight = [
        2500000, 12150000,
        2500000, 12150100,
        2499900, 12150100
    ] as Array<Number>;
    fieldRight.setRouteForTesting(ptsRight);
    fieldRight.simulateLocation(2500000, 12150075, 1.57f, false);
    fieldRight.updateProgressForTesting();
    fieldRight.updateTurnCueForTesting();
    var rightDir = fieldRight.getTurnDirectionForTesting();
    Test.assert(rightDir != 0);
    Test.assert(leftDir != rightDir);

    logger.debug("testTurnCueApproachAndDirection passed.");
    return true;
}

(:test)
function testCoveredMetersAndRemainingProgress(logger as Toybox.Test.Logger) as Boolean {
    var field = new RouteDataField();
    // 2-segment straight East route (~201m total)
    var pts = [
        2500000, 12150000,
        2500000, 12150100,
        2500000, 12150200
    ] as Array<Number>;
    field.setRouteForTesting(pts);
    var total = field.getTotalRouteMetersForTesting();
    Test.assert(total > 190.0f && total < 215.0f);

    // Start
    field.simulateLocation(2500000, 12150002, 1.57f, false);
    field.updateProgressForTesting();
    Test.assert(field.getCoveredMetersForTesting() < 10.0f);

    // Midpoint (~100m)
    field.simulateLocation(2500000, 12150100, 1.57f, false);
    field.updateProgressForTesting();
    var midCovered = field.getCoveredMetersForTesting();
    Test.assert(midCovered > 90.0f && midCovered < 115.0f);

    // End (~200m) -> completes route
    field.simulateLocation(2500000, 12150195, 1.57f, false);
    field.updateProgressForTesting();
    Test.assertEqual(field.checkCompletionForTesting(), true);

    logger.debug("testCoveredMetersAndRemainingProgress passed.");
    return true;
}

(:test)
function testPreviewRendererZeroSpanAndSmallScreen(logger as Toybox.Test.Logger) as Boolean {
    var field = new RouteDataField();
    // Degenerate zero-span route (identical points) must not divide by zero in preview render
    var pts = [
        2500000, 12150000,
        2500000, 12150000
    ] as Array<Number>;
    field.setRouteForTesting(pts);
    field.simulateLocation(2501000, 12151000, 0.5f, true);

    var bb416 = Graphics.createBufferedBitmap({:width => 416, :height => 416});
    field.onUpdate(bb416.get().getDc());

    var bb260 = Graphics.createBufferedBitmap({:width => 260, :height => 260});
    field.onUpdate(bb260.get().getDc());

    logger.debug("testPreviewRendererZeroSpanAndSmallScreen passed.");
    return true;
}

(:test)
function testOffCourseRecoveryWithProgressUpdate(logger as Toybox.Test.Logger) as Boolean {
    var field = new RouteDataField();
    var pts = [
        2500000, 12150000,
        2500000, 12150200
    ] as Array<Number>;
    field.setRouteForTesting(pts);
    field.setGpsAccuracyForTesting(3);

    // Move ~55m North (off course > 35m) for 3 consecutive ticks
    for (var i = 0; i < 3; i++) {
        field.simulateLocation(2500050, 12150100, 1.57f, false);
        var dist = field.updateProgressForTesting();
        field.updateOffCourseForTesting(dist);
    }
    Test.assertEqual(field.isOffCourse(), true);

    // Return to route (< 25m): off-course clears immediately
    field.simulateLocation(2500005, 12150100, 1.57f, false);
    var backDist = field.updateProgressForTesting();
    field.updateOffCourseForTesting(backDist);
    Test.assertEqual(field.isOffCourse(), false);

    logger.debug("testOffCourseRecoveryWithProgressUpdate passed.");
    return true;
}

(:test)
function testSettingsChangePreservesProgress(logger as Toybox.Test.Logger) as Boolean {
    var field = new RouteDataField();
    var pts = [
        2500000, 12150000,
        2500000, 12150100,
        2500000, 12150200
    ] as Array<Number>;
    field.setRouteForTesting(pts);

    // Advance to midpoint (~100m)
    field.simulateLocation(2500000, 12150100, 1.57f, false);
    field.updateProgressForTesting();
    var coveredBefore = field.getCoveredMetersForTesting();
    var segBefore = field.getCurrentSegmentIndexForTesting();
    Test.assert(coveredBefore > 90.0f);

    // Triggering reloadRoute when routeString & routeDirection are unchanged must preserve progress
    field.reloadRoute();
    Test.assertEqual(field.getCurrentSegmentIndexForTesting(), segBefore);
    Test.assert(field.getCoveredMetersForTesting() > 90.0f);

    logger.debug("testSettingsChangePreservesProgress passed.");
    return true;
}

(:test)
function testSplitScreenDataFieldRender(logger as Toybox.Test.Logger) as Boolean {
    var field = new RouteDataField();
    var pts = [
        2500000, 12150000,
        2500000, 12150100,
        2500100, 12150100
    ] as Array<Number>;
    field.setRouteForTesting(pts);

    var bbHalf = Graphics.createBufferedBitmap({:width => 416, :height => 208});
    var dcHalf = bbHalf.get().getDc();
    field.simulateLocation(2501000, 12151000, 0.5f, true);
    field.onUpdate(dcHalf);
    field.simulateLocation(2500000, 12150050, 1.57f, false);
    field.onUpdate(dcHalf);

    var bbThird = Graphics.createBufferedBitmap({:width => 416, :height => 140});
    var dcThird = bbThird.get().getDc();
    field.onUpdate(dcThird);

    logger.debug("testSplitScreenDataFieldRender passed.");
    return true;
}

