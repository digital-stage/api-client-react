import { applyMiddleware, createStore } from 'redux'
import { composeWithDevTools } from 'redux-devtools-extension'
import reducer from './reducers'

const store = createStore(reducer, composeWithDevTools(applyMiddleware()))

export type AppDispatch = typeof store.dispatch

export default store
