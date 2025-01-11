import dayjsInstance from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';
import minMax from 'dayjs/plugin/minMax';
import 'dayjs/locale/en';
import 'dayjs/locale/vi';

dayjsInstance.extend(relativeTime);
dayjsInstance.extend(quarterOfYear);
dayjsInstance.extend(minMax);

export default dayjsInstance;
