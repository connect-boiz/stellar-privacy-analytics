import React from 'react';
import EncryptedSearch from './components/EncryptedSearch';

const SearchPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <EncryptedSearch />
    </div>
  );
};

export default SearchPage;