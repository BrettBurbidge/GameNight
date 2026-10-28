import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { NameGate } from './NameGate';

const ProfileEditorContext = createContext<() => void>(() => {});

/** Lets any component open the name/avatar editor. Changes sync to the current room automatically. */
export function ProfileEditorProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const edit = useCallback(() => setOpen(true), []);
  return (
    <ProfileEditorContext.Provider value={edit}>
      {children}
      {open && (
        <NameGate
          title="Edit your profile"
          subtitle="Change how your friends see you. Updates instantly in any game you’re in."
          submitLabel="Save"
          onDone={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      )}
    </ProfileEditorContext.Provider>
  );
}

export const useEditProfile = () => useContext(ProfileEditorContext);
