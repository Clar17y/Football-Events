import React from 'react';
import { IonModal, IonCard, IonCardContent, IonButton, IonText } from '@ionic/react';

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
    <IonModal isOpen={isOpen} onDidDismiss={onClose}>
      <IonCard style={{ margin: 16 }}>
        <IonCardContent>
          <h2 style={{ marginTop: 0 }}>Create a free account</h2>
          <IonText color="medium">
            Sign up to remove guest limits, sync your data, and access advanced features like Awards and Statistics.
          </IonText>
          <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
            <IonButton fill="outline" onClick={() => go('login')}>Sign in</IonButton>
            <IonButton onClick={() => go('register')}>Create account</IonButton>
          </div>
        </IonCardContent>
      </IonCard>
    </IonModal>
  );
};

export default SignupPromptModal;

