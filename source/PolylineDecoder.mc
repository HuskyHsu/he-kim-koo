import Toybox.Lang;

//! Lightweight, memory-safe Google Encoded Polyline decoder.
//! Converts ASCII delta strings into a flat array of microdegrees (1e-5 degrees).
class PolylineDecoder {

    // Maximum decoded points limit to safeguard Data Field memory quota (<1KB heap)
    public static const MAX_POINTS = 150;

    // Decode status codes
    public static const STATUS_OK = 0;
    public static const STATUS_EMPTY = 1;
    public static const STATUS_INVALID = 2;
    public static const STATUS_TRUNCATED = 3;

    public static var lastStatus as Number = STATUS_EMPTY;
    public static var lastTotalPoints as Number = 0;

    //! Decodes a Google Encoded Polyline string.
    //! @param str The encoded polyline string
    //! @return Flat array [lat0, lon0, lat1, lon1, ...] in microdegrees (1e-5 deg)
    public static function decode(str as String?) as Array<Number> {
        if (str == null || str.length() == 0) {
            lastStatus = STATUS_EMPTY;
            lastTotalPoints = 0;
            return [] as Array<Number>;
        }

        // Use UTF-8 ByteArray (1 byte/char) instead of boxed Array<Char> to minimize heap spike
        var bytes = str.toUtf8Array();
        var len = bytes.size();
        var index = 0;

        var lat = 0;
        var lon = 0;
        var maxCoords = MAX_POINTS * 2;

        // Pre-allocate fixed-size array to avoid GC fragmentation from dynamic resizing
        var temp = new [maxCoords] as Array<Number>;
        var count = 0;
        var incomplete = false;

        while (index < len && count < maxCoords) {
            var b = 0;
            var shift = 0;
            var result = 0;

            do {
                if (index >= len) {
                    incomplete = true;
                    break;
                }
                var raw = bytes[index];
                if (raw < 63 || raw > 126) {
                    lastStatus = STATUS_INVALID;
                    lastTotalPoints = 0;
                    return [] as Array<Number>;
                }
                b = raw - 63;
                index++;
                result = result | ((b & 0x1F) << shift);
                shift += 5;
            } while (b >= 0x20);

            if (incomplete) {
                break;
            }

            var delta = ((result & 1) != 0) ? ~(result >> 1) : (result >> 1);
            if ((count & 1) == 0) {
                lat += delta;
                if (lat < -9000000 || lat > 9000000) {
                    lastStatus = STATUS_INVALID;
                    lastTotalPoints = 0;
                    return [] as Array<Number>;
                }
                temp[count] = lat;
            } else {
                lon += delta;
                if (lon < -18000000 || lon > 18000000) {
                    lastStatus = STATUS_INVALID;
                    lastTotalPoints = 0;
                    return [] as Array<Number>;
                }
                temp[count] = lon;
            }
            count++;
        }

        // Ensure complete (lat, lon) pairs only
        count = count & ~1;
        var pointCount = count / 2;
        if (pointCount < 2) {
            lastStatus = STATUS_INVALID;
            lastTotalPoints = 0;
            return [] as Array<Number>;
        }

        // Count remaining coordinates without heap allocation if string exceeded MAX_POINTS
        var totalPoints = pointCount;
        if (index < len && !incomplete) {
            var extraCoords = 0;
            while (index < len) {
                var b2 = 0;
                var remIncomplete = false;
                do {
                    if (index >= len) {
                        remIncomplete = true;
                        break;
                    }
                    var raw2 = bytes[index];
                    if (raw2 < 63 || raw2 > 126) {
                        lastStatus = STATUS_INVALID;
                        lastTotalPoints = 0;
                        return [] as Array<Number>;
                    }
                    b2 = raw2 - 63;
                    index++;
                } while (b2 >= 0x20);
                if (remIncomplete) {
                    incomplete = true;
                    break;
                }
                extraCoords++;
            }
            totalPoints += (extraCoords / 2);
        }

        lastTotalPoints = totalPoints;
        lastStatus = (totalPoints > MAX_POINTS || incomplete) ? STATUS_TRUNCATED : STATUS_OK;

        if (count == maxCoords) {
            return temp;
        }
        return temp.slice(0, count) as Array<Number>;
    }
}
