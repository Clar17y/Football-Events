import React from 'react';
import { IonModal, IonContent, IonHeader, IonToolbar, IonTitle, IonButton, IonText, IonButtons } from '@ionic/react';

interface SignupPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SignupPromptModal: React.FC<SignupPromptModalProps> = ({ isOpen, onClose }) => {
  const go = (path: string) => {
    try {
      const p = path.startsWith('/') ? path : `/${path}`;
      window.history.pushState({}, '', p);
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch {}
    onClose();
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose} initialBreakpoint={0.4} breakpoints={[0, 0.4, 0.6]}>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Create a free account</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose}>Close</IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <IonText color="medium">
          <p>Sign up to remove guest limits, sync your data, and access advanced features like Awards and Statistics.</p>
        </IonText>
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <IonButton fill="outline" onClick={() => go('login')}>Sign in</IonButton>
          <IonButton onClick={() => go('register')}>Create account</IonButton>
        </div>
      </IonContent>
    </IonModal>
  );
};

export default SignupPromptModal;

