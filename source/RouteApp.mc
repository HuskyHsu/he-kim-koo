import Toybox.Application;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;
import Toybox.Activity;
import Toybox.Position;

//! Application entry point managing lifecycle and live settings change events
class RouteApp extends Application.AppBase {

    private var mDataField as RouteDataField?;

    function initialize() {
        AppBase.initialize();
    }

    function onStart(state as Dictionary?) as Void {
    }

    function onStop(state as Dictionary?) as Void {
        mDataField = null;
    }

    //! Returns the initial Data Field view
    function getInitialView() as [Views] or [Views, InputDelegates] {
        var field = new RouteDataField();
        mDataField = field;
        return [ field ];
    }

    //! Triggered when user updates and saves settings in the Garmin Connect mobile app
    function onSettingsChanged() as Void {
        var field = mDataField;
        if (field != null) {
            field.reloadRoute();
        }
        WatchUi.requestUpdate();
    }
}

function getApp() as RouteApp {
    return Application.getApp() as RouteApp;
}

(:test)
function testLoadRoute(logger as Toybox.Test.Logger) as Boolean {
    var rawStr = "{~wCskwdVuAFsACH}G@FqACmA@q@As@ABwDCvDKAJ@r@@p@@MrGeACO?S?kAA}@AgBCeBGF@KhEY?q@CgAA?FDoEaALaBCADc@AK@?OIrMcAEuJI}F{Sn@iCzCkCDAlAQr@Ax@CrBDN@tAJ|A?B?BDf@?JUJCTE@?FD~C{ELH|H{Kd@]~Aq@NYLCdAQBLf@Ap@??OL?G}Aj@SOa@ECAA?cCrBaFLc@Fe@FAD?F@r@wAF@?yBKjc@sA?iAAEAG|HfC@R?DCD@EAEBJhAI?EvO";
    var pts = PolylineDecoder.decode(rawStr);
    logger.debug("Decoded point count: " + (pts.size() / 2));
    var field = new RouteDataField();
    field.setRouteForTesting(pts);

    var bb = Graphics.createBufferedBitmap({:width => 416, :height => 416});
    var dc = bb.get().getDc();

    logger.debug("1. Testing onUpdate without GPS (preview)...");
    field.onUpdate(dc);
    logger.debug("Passed 1.");

    logger.debug("2. Testing onUpdate with far away GPS (preview mode, out of range)...");
    field.simulateLocation(2500000, 12150000, 0.5f, true);
    field.onUpdate(dc);
    logger.debug("Passed 2.");

    logger.debug("3. Testing onUpdate with nearby GPS (preview mode, inside range)...");
    field.simulateLocation(2506270, 12153034, 1.2f, true);
    field.onUpdate(dc);
    logger.debug("Passed 3.");

    logger.debug("4. Testing onUpdate on route (active navigation mode)...");
    field.simulateLocation(2506270, 12153034, 0.0f, false);
    field.onUpdate(dc);
    logger.debug("Passed 4.");

    logger.debug("5. Testing onUpdate in NO ROUTE free-exploration mode...");
    field.setRouteForTesting([]);
    field.onUpdate(dc);
    logger.debug("Passed 5.");

    logger.debug("6. Testing Off-Course Debounce, Hysteresis, and GPS Quality Filter...");
    field.setRouteForTesting(pts);
    field.setGpsAccuracyForTesting(3); // USABLE

    // Single sample > 35m: should NOT trigger off-course yet
    field.updateOffCourseForTesting(40.0f);
    Toybox.Test.assertEqual(field.isOffCourse(), false);

    // Second sample > 35m: still false
    field.updateOffCourseForTesting(42.0f);
    Toybox.Test.assertEqual(field.isOffCourse(), false);

    // Glitch resets if back within 35m
    field.updateOffCourseForTesting(10.0f);
    Toybox.Test.assertEqual(field.isOffCourse(), false);

    // 3 consecutive samples > 35m: triggers off-course!
    field.updateOffCourseForTesting(38.0f);
    field.updateOffCourseForTesting(39.0f);
    field.updateOffCourseForTesting(41.0f);
    Toybox.Test.assertEqual(field.isOffCourse(), true);

    // Hysteresis deadband: recovering to 30m (<= 35m but > 25m) must RETAIN off-course
    field.updateOffCourseForTesting(30.0f);
    Toybox.Test.assertEqual(field.isOffCourse(), true);

    // Recovering to <= 25m clears off-course
    field.updateOffCourseForTesting(22.0f);
    Toybox.Test.assertEqual(field.isOffCourse(), false);

    // GPS Quality < QUALITY_USABLE (e.g. 2 / POOR): must be ignored
    field.setGpsAccuracyForTesting(2);
    field.updateOffCourseForTesting(50.0f);
    field.updateOffCourseForTesting(50.0f);
    field.updateOffCourseForTesting(50.0f);
    Toybox.Test.assertEqual(field.isOffCourse(), false); // Ignored due to low GPS quality!
    logger.debug("Passed 6.");

    return true;
}
