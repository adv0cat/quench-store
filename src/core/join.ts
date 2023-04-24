import type {
  AnyStores,
  Store,
  StoresType,
  StoresActions,
} from "../interfaces/store";
import type { Unsubscribe } from "../interfaces/core";
import type { ActionOptions } from "../interfaces/action";
import type { ActionID, JoinStoreID } from "../interfaces/id";
import { nextActionId } from "../utils/id";
import { freeze } from "../utils/freeze";
import { getArgsForLog } from "../utils/get-args-for-log";
import { getCoreFn } from "../utils/get-core-fn";
import { isNotReadOnlyStore } from "../utils/is";

export const join = <Stores extends AnyStores, R extends StoresType<Stores>>(
  stores: Stores
): Store<R> => {
  const storesNameList = Object.keys(stores) as (keyof Stores)[];
  const storesNameListLength = storesNameList.length;
  const getStates = () => {
    const states = {} as R;
    for (let i = 0; i < storesNameListLength; i++) {
      const storeName = storesNameList[i];
      states[storeName] = stores[storeName].get();
    }
    return freeze<R>(states);
  };
  let states = getStates();

  const storeID: JoinStoreID = `{${storesNameList
    .map((storeName) => stores[storeName].id())
    .join(";")}}`;

  const [get, id, watch, notify] = getCoreFn(
    () => states,
    () => storeID
  );

  console.info(`${storeID} created`);

  const unsubscribes: Record<string, Unsubscribe> = {};
  const actions = storesNameList.reduce((result, storeName) => {
    const store = stores[storeName];
    const actionID: ActionID = `${store.id()}.#set`;
    const options: ActionOptions = { id: actionID };
    if (!(actionID in unsubscribes)) {
      unsubscribes[actionID] = store.watch((_, info) => {
        info.actionID !== actionID && notify(states, info);
      });
      if (isNotReadOnlyStore(store)) {
        result[storeName as keyof StoresActions<Stores>] = store.action(
          (_, value) => value,
          options
        ) as StoresActions<Stores>[keyof StoresActions<Stores>];
      }
    }
    return result;
  }, {} as StoresActions<Stores>);
  const actionsNameList = storesNameList.filter(
    (key) => key in actions
  ) as (keyof StoresActions<Stores>)[];

  return {
    isReadOnly: false,
    id,
    get,
    watch,
    action: (action, { id } = {}) => {
      const actionID: ActionID = nextActionId(id);
      return (...args) => {
        console.group(`${storeID} ${actionID}(${getArgsForLog(args)})`);
        const actionStates = action(states, ...args);
        if (actionStates == null || states === actionStates) {
          console.info("%c not changed", "color: #FF5E5B");
          console.groupEnd();
        }

        if (
          actionsNameList.some((storeName) =>
            storeName in actionStates
              ? actions[storeName](actionStates[storeName])
              : false
          )
        ) {
          const newStates = getStates();
          console.info(
            "%c changed:",
            "color: #BDFF66",
            states,
            "->",
            newStates
          );
          states = newStates;
          notify(states, { actionID });
          console.groupEnd();
          return true;
        }
      };
    },
  } as Store<R>;
};
