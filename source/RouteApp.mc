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

    return true;
}
