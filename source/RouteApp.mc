import Toybox.Application;
import Toybox.Lang;
import Toybox.WatchUi;

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
