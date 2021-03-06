import indexOf from 'lodash/indexOf'

const upsert = <T>(arr: Readonly<T[]>, value: T): T[] => {
    if (!arr) {
        return [value]
    }
    if (indexOf<T>(arr, value) === -1) {
        return [...arr, value]
    }
    return [...arr]
}
export default upsert
